/**
 * In-memory daily message rate limiter.
 *
 * Tracks per-user daily message counts using a Map keyed by "userId:YYYY-MM-DD".
 * Limits: Free = 10 messages/day, Pro = 200 messages/day, Ultra = 2500 messages/day.
 *
 * Why in-memory:
 * - Single-process on Railway, no need for distributed state
 * - O(1) lookups, zero network latency
 * - Counters reset naturally at midnight UTC
 * - Server restart = fresh counters (generous, not restrictive)
 */

const PLAN_LIMITS: Record<string, number> = {
  free: 10,
  pro: 200,
  ultra: 2500,
};

// Map<"userId:YYYY-MM-DD", count>
const dailyCounts = new Map<string, number>();

/** Get today's date key in UTC (YYYY-MM-DD) */
function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Build the composite key for a user + date */
function userDayKey(userId: string, date?: string): string {
  return `${userId}:${date || todayKey()}`;
}

export interface RateLimitResult {
  /** Whether this request is allowed */
  allowed: boolean;
  /** Remaining messages for today */
  remaining: number;
  /** Total daily limit for this plan */
  limit: number;
  /** Unix timestamp of when the limit resets (next midnight UTC) */
  resetAt: number;
}

/**
 * Check if the user is within their daily limit and increment the counter.
 * Returns the result with remaining count and whether the request is allowed.
 *
 * IMPORTANT: This increments atomically -- call it once per request.
 */
export function checkAndIncrement(userId: string, plan: string): RateLimitResult {
  const limit = PLAN_LIMITS[plan] || PLAN_LIMITS.free;
  const key = userDayKey(userId);
  const current = dailyCounts.get(key) || 0;

  // Calculate reset time (next midnight UTC)
  const now = new Date();
  const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const resetAt = Math.floor(tomorrow.getTime() / 1000);

  if (current >= limit) {
    return {
      allowed: false,
      remaining: 0,
      limit,
      resetAt,
    };
  }

  // Increment counter
  dailyCounts.set(key, current + 1);

  return {
    allowed: true,
    remaining: limit - current - 1,
    limit,
    resetAt,
  };
}

/**
 * Get current usage for a user today (without incrementing).
 */
export function getCurrentUsage(userId: string): number {
  const key = userDayKey(userId);
  return dailyCounts.get(key) || 0;
}

/**
 * Get the daily limit for a given plan.
 */
export function getLimitForPlan(plan: string): number {
  return PLAN_LIMITS[plan] || PLAN_LIMITS.free;
}

/**
 * Periodic cleanup of old date entries to prevent memory leaks.
 * Removes all entries that are not from today.
 */
function cleanup(): void {
  const today = todayKey();

  for (const key of dailyCounts.keys()) {
    const datepart = key.split(':').pop();
    if (datepart !== today) {
      dailyCounts.delete(key);
    }
  }
}

// Run cleanup every hour
setInterval(cleanup, 60 * 60 * 1000).unref();
