import type { ProxyConfig } from '../lib/config.js';
import { getSupabaseAdmin } from '../lib/supabase.js';

/**
 * Usage tracking utilities.
 *
 * Records token usage from provider responses and enforces plan limits.
 */

/** Plan limits -- messages per day */
const PLAN_LIMITS: Record<string, number> = {
  free: 10,
  pro: 200,
  ultra: 2500,
};

/**
 * Check if a user has exceeded their daily message limit.
 * Returns { allowed: boolean, remaining: number }.
 */
export async function checkUsageLimit(
  config: ProxyConfig,
  userId: string,
  plan: string,
): Promise<{ allowed: boolean; remaining: number }> {
  const limit = PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;

  // Skip check if Supabase is not configured (development mode)
  if (!config.supabaseUrl) {
    return { allowed: true, remaining: limit };
  }

  const admin = getSupabaseAdmin(config);
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const { count } = await admin
    .from('usage_logs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', today.toISOString());

  const used = count || 0;
  const remaining = Math.max(0, limit - used);

  return {
    allowed: used < limit,
    remaining,
  };
}

/**
 * Record a usage event after a successful proxy response.
 * Extracts token counts from the response body if available.
 */
export async function recordUsage(
  config: ProxyConfig,
  params: {
    userId: string;
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
  },
): Promise<void> {
  // Skip recording if Supabase is not configured (development mode)
  if (!config.supabaseUrl) {
    return;
  }

  const admin = getSupabaseAdmin(config);

  // Estimate cost in cents based on provider pricing
  const costCents = estimateCostCents(
    params.provider,
    params.model,
    params.inputTokens,
    params.outputTokens,
  );

  await admin.from('usage_logs').insert({
    user_id: params.userId,
    provider: params.provider,
    model: params.model,
    input_tokens: params.inputTokens,
    output_tokens: params.outputTokens,
    cost_cents: costCents,
  });
}

/**
 * Estimate cost in cents based on provider and model.
 * These are approximate rates -- updated periodically.
 */
function estimateCostCents(
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  // Rates per million tokens (in cents)
  // Keep in sync with @simplestclaw/models (packages/models/src/index.ts)
  const rates: Record<string, { input: number; output: number }> = {
    // Anthropic
    'claude-opus-4-5-20251124': { input: 500, output: 2500 },
    'claude-opus-4-5': { input: 500, output: 2500 },           // alias
    'claude-sonnet-4-5-20250929': { input: 300, output: 1500 },
    'claude-sonnet-4-5': { input: 300, output: 1500 },         // alias
    'claude-haiku-4-5-20251001': { input: 100, output: 500 },
    'claude-haiku-4-5': { input: 100, output: 500 },           // alias
    // OpenAI
    'gpt-5.2': { input: 175, output: 1400 },
    'gpt-5-mini': { input: 25, output: 200 },
    // Google
    'gemini-3-pro-preview': { input: 200, output: 1200 },
    'gemini-3-flash-preview': { input: 50, output: 300 },
  };

  const modelKey = Object.keys(rates).find((k) => model.includes(k));
  const rate = modelKey ? rates[modelKey] : { input: 300, output: 1500 }; // Default to Sonnet pricing

  const inputCost = (inputTokens / 1_000_000) * rate.input;
  const outputCost = (outputTokens / 1_000_000) * rate.output;

  return Math.ceil(inputCost + outputCost);
}
