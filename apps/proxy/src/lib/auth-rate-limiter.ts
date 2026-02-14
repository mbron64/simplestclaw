/**
 * IP-based rate limiter for auth endpoints.
 *
 * Prevents brute-force login attacks, signup spam, and magic-link abuse
 * by tracking request counts per IP + action within a sliding time window.
 *
 * Uses the same in-memory approach as rate-limiter.ts -- suitable for
 * single-instance Railway deployment. Server restart = fresh counters.
 *
 * Limits:
 *   login:      10 attempts per 15 minutes per IP
 *   signup:      5 attempts per 60 minutes per IP
 *   magic-link:  5 attempts per 60 minutes per IP
 *   google:     10 attempts per 15 minutes per IP
 */

interface WindowEntry {
  count: number;
  windowStart: number; // Unix ms
}

/** Per-action configuration */
const ACTION_LIMITS: Record<string, { maxAttempts: number; windowMs: number }> = {
  login:        { maxAttempts: 10, windowMs: 15 * 60 * 1000 },  // 10 per 15 min
  signup:       { maxAttempts: 5,  windowMs: 60 * 60 * 1000 },  // 5 per hour
  'magic-link': { maxAttempts: 5,  windowMs: 60 * 60 * 1000 },  // 5 per hour
  google:       { maxAttempts: 10, windowMs: 15 * 60 * 1000 },  // 10 per 15 min
};

// Map<"ip:action", WindowEntry>
const windows = new Map<string, WindowEntry>();

function compositeKey(ip: string, action: string): string {
  return `${ip}:${action}`;
}

export interface AuthRateLimitResult {
  /** Whether this request is allowed */
  allowed: boolean;
  /** Seconds until the window resets (for Retry-After header) */
  retryAfterSeconds: number;
}

/**
 * Check whether the given IP is within the rate limit for the specified action.
 * Automatically increments the counter if allowed.
 */
export function checkAuthRateLimit(ip: string, action: string): AuthRateLimitResult {
  const config = ACTION_LIMITS[action] || ACTION_LIMITS.login;
  const key = compositeKey(ip, action);
  const now = Date.now();

  const entry = windows.get(key);

  // If no entry or the window has expired, start a fresh window
  if (!entry || now - entry.windowStart >= config.windowMs) {
    windows.set(key, { count: 1, windowStart: now });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  // Window still active -- check limit
  if (entry.count >= config.maxAttempts) {
    const retryAfterMs = config.windowMs - (now - entry.windowStart);
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
    };
  }

  // Allowed -- increment
  entry.count++;
  return { allowed: true, retryAfterSeconds: 0 };
}

/**
 * Extract the real client IP from proxy headers.
 * Railway sets X-Forwarded-For; Cloudflare sets CF-Connecting-IP.
 */
export function getClientIp(c: { req: { header: (name: string) => string | undefined } }): string {
  // CF-Connecting-IP is most reliable when behind Cloudflare
  const cfIp = c.req.header('cf-connecting-ip');
  if (cfIp) return cfIp;

  // X-Forwarded-For may contain multiple IPs; first is the original client
  const xff = c.req.header('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();

  // Fallback -- use a sentinel so rate limiting still works (all unknown IPs share a bucket)
  return 'unknown';
}

/**
 * Periodic cleanup of expired window entries to prevent memory leaks.
 */
function cleanup(): void {
  const now = Date.now();
  for (const [key, entry] of windows.entries()) {
    // Determine action from key to look up the correct window duration
    const action = key.split(':').pop() || 'login';
    const config = ACTION_LIMITS[action] || ACTION_LIMITS.login;
    if (now - entry.windowStart >= config.windowMs) {
      windows.delete(key);
    }
  }
}

// Run cleanup every hour
setInterval(cleanup, 60 * 60 * 1000).unref();
