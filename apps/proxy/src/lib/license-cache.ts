import type { ProxyConfig } from './config.js';
import { getSupabaseAdmin } from './supabase.js';

/**
 * In-memory license key cache.
 *
 * Maps licenseKey -> { userId, plan, status } with a 5-minute TTL.
 * On cache miss, queries Supabase (license_keys + subscriptions).
 * Returns null for invalid/inactive/revoked keys.
 *
 * Why in-memory instead of Redis:
 * - Single-process deployment on Railway
 * - Avoids ~50-100ms network round-trip to Redis/Supabase on every request
 * - Cache miss only costs one Supabase query, then it's free for 5 minutes
 */

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export interface CachedLicense {
  userId: string;
  plan: 'free' | 'pro';
  status: string;
  cachedAt: number;
}

// The cache itself -- module-level singleton
const cache = new Map<string, CachedLicense>();

// Also cache negative results (invalid keys) to prevent repeated DB lookups
const negativeCache = new Map<string, number>(); // key -> timestamp
const NEGATIVE_TTL_MS = 2 * 60 * 1000; // 2 minutes for invalid keys

/**
 * Resolve a license key to user info + plan.
 * Returns cached result if fresh, otherwise queries Supabase.
 * Returns null for invalid/inactive keys.
 */
export async function resolveLicenseKey(
  config: ProxyConfig,
  licenseKey: string,
): Promise<CachedLicense | null> {
  const now = Date.now();

  // Check positive cache
  const cached = cache.get(licenseKey);
  if (cached && now - cached.cachedAt < CACHE_TTL_MS) {
    return cached;
  }

  // Check negative cache (known-bad keys)
  const negativeTs = negativeCache.get(licenseKey);
  if (negativeTs && now - negativeTs < NEGATIVE_TTL_MS) {
    return null;
  }

  // Cache miss -- query Supabase
  try {
    const admin = getSupabaseAdmin(config);

    // Look up the license key and join with subscriptions
    const { data: keyData, error: keyError } = await admin
      .from('license_keys')
      .select('user_id')
      .eq('key', licenseKey)
      .eq('active', true)
      .single();

    if (keyError || !keyData) {
      // Invalid or inactive key -- cache negative result
      negativeCache.set(licenseKey, now);
      return null;
    }

    const userId = keyData.user_id;

    // Fetch subscription plan
    const { data: subData } = await admin
      .from('subscriptions')
      .select('plan, status')
      .eq('user_id', userId)
      .single();

    const validPlans = new Set(['free', 'pro', 'ultra']);
    const rawPlan = validPlans.has(subData?.plan) ? subData!.plan : 'free';
    const status = subData?.status || 'active';

    // Fully reject cancelled/inactive subscriptions
    if (status === 'cancelled' || status === 'inactive') {
      negativeCache.set(licenseKey, now);
      return null;
    }

    // Downgrade past_due users to free-tier limits as a grace period.
    // They can still use the service (incentive to fix payment) but with
    // reduced limits. Once Stripe retries succeed, they get their plan back.
    const plan = status === 'past_due' ? 'free' : rawPlan;

    const entry: CachedLicense = {
      userId,
      plan,
      status,
      cachedAt: now,
    };

    cache.set(licenseKey, entry);
    return entry;
  } catch (err) {
    console.error('[license-cache] Failed to resolve license key:', err);
    // On error, don't cache -- let the next request retry
    return null;
  }
}

/**
 * Invalidate a specific license key from the cache.
 * Useful after plan upgrades, key revocations, etc.
 */
export function invalidateLicenseKey(licenseKey: string): void {
  cache.delete(licenseKey);
  negativeCache.delete(licenseKey);
}

/**
 * Clear all cached entries. Useful for testing.
 */
export function clearCache(): void {
  cache.clear();
  negativeCache.clear();
}

/**
 * Periodic cleanup of expired entries to prevent memory leaks.
 * Called automatically every 10 minutes.
 */
function cleanup(): void {
  const now = Date.now();

  for (const [key, entry] of cache) {
    if (now - entry.cachedAt > CACHE_TTL_MS) {
      cache.delete(key);
    }
  }

  for (const [key, ts] of negativeCache) {
    if (now - ts > NEGATIVE_TTL_MS) {
      negativeCache.delete(key);
    }
  }
}

// Run cleanup every 10 minutes
setInterval(cleanup, 10 * 60 * 1000).unref();
