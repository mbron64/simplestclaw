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
  pro: 500,
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
  const today = new Date();
  today.setHours(0, 0, 0, 0);

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
  const rates: Record<string, { input: number; output: number }> = {
    // Anthropic
    'claude-sonnet-4-20250514': { input: 300, output: 1500 },
    'claude-opus-4-20250514': { input: 1500, output: 7500 },
    // OpenAI
    'gpt-4o': { input: 250, output: 1000 },
    'gpt-4o-mini': { input: 15, output: 60 },
    // Google
    'gemini-2.5-pro': { input: 125, output: 1000 },
  };

  const modelKey = Object.keys(rates).find((k) => model.includes(k));
  const rate = modelKey ? rates[modelKey] : { input: 300, output: 1500 }; // Default to Sonnet pricing

  const inputCost = (inputTokens / 1_000_000) * rate.input;
  const outputCost = (outputTokens / 1_000_000) * rate.output;

  return Math.ceil(inputCost + outputCost);
}
