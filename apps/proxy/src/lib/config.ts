/**
 * Environment configuration for the proxy service.
 * All secrets come from environment variables -- never hardcoded.
 */

export interface ProxyConfig {
  /** Port to listen on (Railway sets this automatically) */
  port: number;

  /** Real Anthropic API key for forwarding requests */
  anthropicApiKey: string;

  /** Real OpenAI API key for forwarding requests */
  openaiApiKey: string;

  /** Real Google API key for forwarding requests */
  googleApiKey: string;

  /** Supabase project URL */
  supabaseUrl: string;

  /** Supabase service role key (server-side only, bypasses RLS) */
  supabaseServiceKey: string;

  /** Supabase anon key (for auth operations) */
  supabaseAnonKey: string;

  /** Stripe secret key */
  stripeSecretKey: string;

  /** Stripe webhook signing secret */
  stripeWebhookSecret: string;

  /** Stripe Price ID for the Pro plan */
  stripeProPriceId: string;

  /** Stripe Price ID for the Ultra plan */
  stripeUltraPriceId: string;

  /** Public URL of this proxy service (for OAuth redirect) */
  proxyUrl: string;

  /** Environment: development or production */
  nodeEnv: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

/**
 * In production, require critical secrets so the proxy refuses to start
 * without a fully-configured auth + billing backend.
 * In development, fall back to empty strings for local testing.
 */
function envForMode(name: string, nodeEnv: string): string {
  if (nodeEnv === 'production') {
    return requireEnv(name);
  }
  return optionalEnv(name, '');
}

export function loadConfig(): ProxyConfig {
  const nodeEnv = optionalEnv('NODE_ENV', 'development');

  return {
    port: Number.parseInt(optionalEnv('PORT', '3001'), 10),
    anthropicApiKey: envForMode('ANTHROPIC_API_KEY', nodeEnv),
    openaiApiKey: optionalEnv('OPENAI_API_KEY', ''),
    googleApiKey: optionalEnv('GOOGLE_API_KEY', ''),
    supabaseUrl: envForMode('SUPABASE_URL', nodeEnv),
    supabaseServiceKey: envForMode('SUPABASE_SERVICE_ROLE_KEY', nodeEnv),
    supabaseAnonKey: envForMode('SUPABASE_ANON_KEY', nodeEnv),
    stripeSecretKey: envForMode('STRIPE_SECRET_KEY', nodeEnv),
    stripeWebhookSecret: envForMode('STRIPE_WEBHOOK_SECRET', nodeEnv),
    stripeProPriceId: envForMode('STRIPE_PRO_PRICE_ID', nodeEnv),
    stripeUltraPriceId: envForMode('STRIPE_ULTRA_PRICE_ID', nodeEnv),
    proxyUrl: optionalEnv('PROXY_URL', 'https://proxy.simplestclaw.com'),
    nodeEnv,
  };
}
