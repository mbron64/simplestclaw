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

export function loadConfig(): ProxyConfig {
  return {
    port: Number.parseInt(optionalEnv('PORT', '3001'), 10),
    anthropicApiKey: optionalEnv('ANTHROPIC_API_KEY', ''),
    openaiApiKey: optionalEnv('OPENAI_API_KEY', ''),
    googleApiKey: optionalEnv('GOOGLE_API_KEY', ''),
    supabaseUrl: optionalEnv('SUPABASE_URL', ''),
    supabaseServiceKey: optionalEnv('SUPABASE_SERVICE_ROLE_KEY', ''),
    supabaseAnonKey: optionalEnv('SUPABASE_ANON_KEY', ''),
    stripeSecretKey: optionalEnv('STRIPE_SECRET_KEY', ''),
    stripeWebhookSecret: optionalEnv('STRIPE_WEBHOOK_SECRET', ''),
    proxyUrl: optionalEnv('PROXY_URL', 'https://proxy.simplestclaw.com'),
    nodeEnv: optionalEnv('NODE_ENV', 'development'),
  };
}
