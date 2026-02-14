import type { ProxyConfig } from './config.js';
import { getSupabaseAdmin } from './supabase.js';

/**
 * Async usage logger.
 *
 * After a provider response completes, logs token usage to the `usage_logs` table.
 * All logging is fire-and-forget -- failures are logged to console but never
 * block or affect the user's request.
 *
 * Token counts are extracted from provider response bodies:
 * - Anthropic: { usage: { input_tokens, output_tokens } }
 * - OpenAI: { usage: { prompt_tokens, completion_tokens } }
 * - Google: { usageMetadata: { promptTokenCount, candidatesTokenCount } }
 */

// Cost estimates in cents per 1M tokens
// Keep in sync with @simplestclaw/models (packages/models/src/index.ts)
const COST_PER_MILLION: Record<string, { input: number; output: number }> = {
  // Anthropic
  'claude-opus-4-6': { input: 500, output: 2500 },
  'claude-sonnet-4-5-20250929': { input: 300, output: 1500 },
  'claude-sonnet-4-5': { input: 300, output: 1500 }, // alias
  'claude-haiku-4-5-20251001': { input: 100, output: 500 },
  'claude-haiku-4-5': { input: 100, output: 500 }, // alias
  // OpenAI
  'gpt-5.2': { input: 175, output: 1400 },
  'gpt-5-mini': { input: 25, output: 200 },
  // Google
  'gemini-3-pro-preview': { input: 200, output: 1200 },
  'gemini-3-flash-preview': { input: 50, output: 300 },
  // Default fallback
  default: { input: 300, output: 1500 },
};

/** Calculate cost in cents from token counts and model */
function estimateCostCents(model: string, inputTokens: number, outputTokens: number): number {
  const rates = COST_PER_MILLION[model] || COST_PER_MILLION.default;
  const inputCost = (inputTokens / 1_000_000) * rates.input;
  const outputCost = (outputTokens / 1_000_000) * rates.output;
  return Math.round((inputCost + outputCost) * 100) / 100; // round to 2 decimal places
}

export interface UsageData {
  inputTokens: number;
  outputTokens: number;
}

/**
 * Extract token usage from an Anthropic response body.
 * Works for both non-streaming and the final message in streaming responses.
 */
export function extractAnthropicUsage(body: string): UsageData | null {
  try {
    // For non-streaming responses, the body is a single JSON object
    // For streaming, we need to find the final message_delta or message_stop event
    // that contains usage information

    // Try non-streaming first (simple JSON)
    if (body.startsWith('{')) {
      const json = JSON.parse(body);
      if (json.usage) {
        return {
          inputTokens: json.usage.input_tokens || 0,
          outputTokens: json.usage.output_tokens || 0,
        };
      }
    }

    // For streaming (SSE), look for the message_delta event with usage
    // Format: data: {"type":"message_delta","usage":{"output_tokens":123}}
    // Also look for message_start which has input token count
    let inputTokens = 0;
    let outputTokens = 0;
    let found = false;

    const lines = body.split('\n');
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (!data || data === '[DONE]') continue;

      try {
        const event = JSON.parse(data);

        // message_start contains input token usage
        if (event.type === 'message_start' && event.message?.usage) {
          inputTokens = event.message.usage.input_tokens || 0;
          found = true;
        }

        // message_delta contains output token usage
        if (event.type === 'message_delta' && event.usage) {
          outputTokens = event.usage.output_tokens || 0;
          found = true;
        }
      } catch {
        // Skip malformed SSE lines
      }
    }

    return found ? { inputTokens, outputTokens } : null;
  } catch {
    return null;
  }
}

/**
 * Extract token usage from an OpenAI response body.
 */
export function extractOpenAIUsage(body: string): UsageData | null {
  try {
    // Non-streaming: single JSON with usage field
    if (body.startsWith('{')) {
      const json = JSON.parse(body);
      if (json.usage) {
        return {
          inputTokens: json.usage.prompt_tokens || 0,
          outputTokens: json.usage.completion_tokens || 0,
        };
      }
    }

    // Streaming (SSE): look for the final chunk with usage
    // OpenAI includes usage in the last data chunk when stream_options.include_usage is true
    let inputTokens = 0;
    let outputTokens = 0;
    let found = false;

    const lines = body.split('\n');
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (!data || data === '[DONE]') continue;

      try {
        const event = JSON.parse(data);
        if (event.usage) {
          inputTokens = event.usage.prompt_tokens || 0;
          outputTokens = event.usage.completion_tokens || 0;
          found = true;
        }
      } catch {
        // Skip malformed SSE lines
      }
    }

    return found ? { inputTokens, outputTokens } : null;
  } catch {
    return null;
  }
}

/**
 * Extract token usage from a Google (Gemini) response body.
 */
export function extractGoogleUsage(body: string): UsageData | null {
  try {
    if (body.startsWith('{') || body.startsWith('[')) {
      const json = JSON.parse(body);
      // Gemini responses can be an array or single object
      const obj = Array.isArray(json) ? json[json.length - 1] : json;
      if (obj?.usageMetadata) {
        return {
          inputTokens: obj.usageMetadata.promptTokenCount || 0,
          outputTokens: obj.usageMetadata.candidatesTokenCount || 0,
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Log usage to the database asynchronously.
 * Fire-and-forget -- errors are logged to console but don't propagate.
 */
export function logUsage(
  config: ProxyConfig,
  userId: string,
  provider: string,
  model: string,
  usage: UsageData,
): void {
  // Don't block -- run in the background
  const costCents = estimateCostCents(model, usage.inputTokens, usage.outputTokens);

  const doLog = async () => {
    try {
      const admin = getSupabaseAdmin(config);
      const { error } = await admin.from('usage_logs').insert({
        user_id: userId,
        provider,
        model,
        input_tokens: usage.inputTokens,
        output_tokens: usage.outputTokens,
        cost_cents: costCents,
      });

      if (error) {
        console.error('[usage-logger] Failed to insert usage log:', error.message);
      }
    } catch (err) {
      console.error('[usage-logger] Unexpected error logging usage:', err);
    }
  };

  // Fire and forget
  doLog();
}
