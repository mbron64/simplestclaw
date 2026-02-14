/**
 * Shared model definitions for simplestclaw.
 *
 * SINGLE SOURCE OF TRUTH for all model IDs, names, providers, pricing, and plan access.
 * All TypeScript apps (desktop, proxy, web) should import from this package.
 *
 * For the Rust sidecar (apps/desktop/src-tauri/src/sidecar.rs), model IDs are
 * duplicated inline -- keep them in sync with this file when updating.
 *
 * Last updated: February 2026
 */

export type Provider = 'anthropic' | 'openai' | 'google';
export type Plan = 'free' | 'pro' | 'ultra';

export interface ModelDefinition {
  /** The API model ID (e.g. "claude-opus-4-5-20251124") */
  id: string;
  /** Human-readable display name */
  name: string;
  /** Provider: anthropic, openai, or google */
  provider: Provider;
  /** Which plans can access this model */
  plans: Plan[];
  /** Cost per million tokens (in USD cents) */
  cost: {
    input: number;
    output: number;
  };
  /** Short description for UI tooltips */
  description?: string;
}

// ── Model Definitions ─────────────────────────────────────────────────

export const MODELS: readonly ModelDefinition[] = [
  // ── Anthropic ──────────────────────────────────────────────────────
  {
    id: 'claude-opus-4-5-20251124',
    name: 'Claude Opus 4.5',
    provider: 'anthropic',
    plans: ['ultra'],
    cost: { input: 500, output: 2500 },
    description: 'Most powerful Anthropic model — best for complex reasoning',
  },
  {
    id: 'claude-sonnet-4-5-20250929',
    name: 'Claude Sonnet 4.5',
    provider: 'anthropic',
    plans: ['free', 'pro', 'ultra'],
    cost: { input: 300, output: 1500 },
    description: 'Best balance of speed and intelligence',
  },
  {
    id: 'claude-haiku-4-5-20251001',
    name: 'Claude Haiku 4.5',
    provider: 'anthropic',
    plans: ['pro', 'ultra'],
    cost: { input: 100, output: 500 },
    description: 'Fastest model with near-frontier intelligence',
  },

  // ── OpenAI ─────────────────────────────────────────────────────────
  {
    id: 'gpt-5.2',
    name: 'GPT-5.2',
    provider: 'openai',
    plans: ['ultra'],
    cost: { input: 175, output: 1400 },
    description: 'Most capable OpenAI model with advanced reasoning',
  },
  {
    id: 'gpt-5-mini',
    name: 'GPT-5 Mini',
    provider: 'openai',
    plans: ['free', 'pro', 'ultra'],
    cost: { input: 25, output: 200 },
    description: 'Fast and affordable reasoning model',
  },

  // ── Google ─────────────────────────────────────────────────────────
  {
    id: 'gemini-3-pro-preview',
    name: 'Gemini 3 Pro',
    provider: 'google',
    plans: ['pro', 'ultra'],
    cost: { input: 200, output: 1200 },
    description: 'Most advanced Google model with huge context',
  },
  {
    id: 'gemini-3-flash-preview',
    name: 'Gemini 3 Flash',
    provider: 'google',
    plans: ['pro', 'ultra'],
    cost: { input: 50, output: 300 },
    description: 'Frontier intelligence at Flash-level speed',
  },
] as const;

// ── Derived helpers ───────────────────────────────────────────────────

/** All model IDs */
export const MODEL_IDS = MODELS.map((m) => m.id);

/** Models available on the Free plan */
export const FREE_MODELS = MODELS.filter((m) => m.plans.includes('free'));

/** Models available on the Pro plan */
export const PRO_MODELS = MODELS.filter((m) => m.plans.includes('pro'));

/** Models available on the Ultra plan (all models) */
export const ULTRA_MODELS = MODELS;

/** Ultra-only models (not available on Pro or Free) */
export const ULTRA_EXCLUSIVE_MODELS = MODELS.filter(
  (m) => m.plans.includes('ultra') && !m.plans.includes('pro'),
);

/** Set of Free model IDs (for fast lookup) */
export const FREE_MODEL_IDS = new Set(FREE_MODELS.map((m) => m.id));

/** Set of Pro model IDs (for fast lookup) */
export const PRO_MODEL_IDS = new Set(PRO_MODELS.map((m) => m.id));

/** Default model for new users */
export const DEFAULT_MODEL_ID = 'claude-sonnet-4-5-20250929';
export const DEFAULT_MODEL_NAME = 'Claude Sonnet 4.5';

/** Cost lookup by model ID (cents per MTok) */
export const COST_BY_MODEL: Record<string, { input: number; output: number }> = Object.fromEntries(
  MODELS.map((m) => [m.id, m.cost]),
);

/** Model aliases (provider shorthand -> full ID) */
export const MODEL_ALIASES: Record<string, string> = {
  'claude-opus-4-5': 'claude-opus-4-5-20251124',
  'claude-sonnet-4-5': 'claude-sonnet-4-5-20250929',
  'claude-haiku-4-5': 'claude-haiku-4-5-20251001',
};

/** Get display name for a model ID */
export function getModelName(modelId: string): string {
  return MODELS.find((m) => m.id === modelId)?.name || modelId;
}

/** Get models grouped by provider */
export function getModelsByProvider(): Record<Provider, ModelDefinition[]> {
  const grouped: Record<Provider, ModelDefinition[]> = {
    anthropic: [],
    openai: [],
    google: [],
  };
  for (const model of MODELS) {
    grouped[model.provider].push(model);
  }
  return grouped;
}

/** Plan daily message limits */
export const PLAN_LIMITS: Record<Plan, number> = {
  free: 10,
  pro: 200,
  ultra: 2000,
};

/** Free plan model names as a display string */
export const FREE_PLAN_MODELS_TEXT = FREE_MODELS.map((m) => m.name).join(', ');

/** Pro plan model names as a display string */
export const PRO_PLAN_MODELS_TEXT = PRO_MODELS.map((m) => m.name).join(', ');

/** Ultra plan model names as a display string */
export const ULTRA_PLAN_MODELS_TEXT = MODELS.map((m) => m.name).join(', ');
