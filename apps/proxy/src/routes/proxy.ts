import { Hono } from 'hono';
import { proxy } from 'hono/proxy';
import type { ProxyConfig } from '../lib/config.js';

/**
 * Provider proxy routes.
 *
 * OpenClaw gateway sends requests here (configured via models.providers in openclaw.json).
 * The gateway thinks it's talking to Anthropic/OpenAI directly, but the "API key" is
 * actually the user's license key. We validate it, swap for the real provider key,
 * and forward the request. Streaming responses pass through transparently.
 *
 * Endpoints:
 *   POST /v1/anthropic/v1/messages  -- Anthropic Messages API
 *   POST /v1/openai/v1/chat/completions  -- OpenAI Chat Completions API
 */

// Upstream provider base URLs
const ANTHROPIC_BASE = 'https://api.anthropic.com';
const OPENAI_BASE = 'https://api.openai.com';
const GOOGLE_BASE = 'https://generativelanguage.googleapis.com';

/**
 * Extract the license key from the Authorization header.
 * OpenClaw sends it as: "Bearer <license-key>" (via apiKey config)
 * or Anthropic-style: "x-api-key: <license-key>"
 */
function extractLicenseKey(c: { req: { header: (name: string) => string | undefined } }): string | null {
  // Anthropic uses x-api-key header
  const xApiKey = c.req.header('x-api-key');
  if (xApiKey) return xApiKey;

  // OpenAI uses Authorization: Bearer <key>
  const auth = c.req.header('authorization');
  if (auth?.startsWith('Bearer ')) {
    return auth.slice(7);
  }

  return null;
}

export function createProxyRoutes(config: ProxyConfig) {
  const app = new Hono();

  // ── Anthropic proxy ──────────────────────────────────────────────
  // Matches: POST /v1/anthropic/v1/messages (and any sub-path)
  // OpenClaw sets baseUrl to "https://proxy.simplestclaw.com/v1/anthropic"
  // then appends "/v1/messages" for the Anthropic Messages API
  app.all('/v1/anthropic/*', async (c) => {
    const licenseKey = extractLicenseKey(c);
    if (!licenseKey) {
      return c.json({ error: { message: 'Missing API key' } }, 401);
    }

    if (!config.anthropicApiKey) {
      return c.json({ error: { message: 'Anthropic provider not configured' } }, 503);
    }

    // TODO: Validate license key against Supabase (Phase 1b/1c)
    // TODO: Check usage limits (Phase 1e)

    // Strip our prefix to get the real Anthropic path
    // /v1/anthropic/v1/messages -> /v1/messages
    const upstreamPath = c.req.path.replace('/v1/anthropic', '');
    const upstreamUrl = `${ANTHROPIC_BASE}${upstreamPath}`;

    // Forward with real API key, preserving all other headers
    return proxy(upstreamUrl, {
      ...c.req,
      headers: {
        ...c.req.header(),
        'x-api-key': config.anthropicApiKey,
        'authorization': undefined as unknown as string, // Remove license key
        'host': 'api.anthropic.com',
      },
    });
  });

  // ── OpenAI proxy ─────────────────────────────────────────────────
  // Matches: POST /v1/openai/v1/chat/completions (and any sub-path)
  // OpenClaw sets baseUrl to "https://proxy.simplestclaw.com/v1/openai"
  // then appends "/v1/chat/completions" for the Chat Completions API
  app.all('/v1/openai/*', async (c) => {
    const licenseKey = extractLicenseKey(c);
    if (!licenseKey) {
      return c.json({ error: { message: 'Missing API key' } }, 401);
    }

    if (!config.openaiApiKey) {
      return c.json({ error: { message: 'OpenAI provider not configured' } }, 503);
    }

    // TODO: Validate license key against Supabase (Phase 1b/1c)
    // TODO: Check usage limits (Phase 1e)

    // Strip our prefix to get the real OpenAI path
    // /v1/openai/v1/chat/completions -> /v1/chat/completions
    const upstreamPath = c.req.path.replace('/v1/openai', '');
    const upstreamUrl = `${OPENAI_BASE}${upstreamPath}`;

    return proxy(upstreamUrl, {
      ...c.req,
      headers: {
        ...c.req.header(),
        'authorization': `Bearer ${config.openaiApiKey}`,
        'host': 'api.openai.com',
      },
    });
  });

  // ── Google proxy ─────────────────────────────────────────────────
  app.all('/v1/google/*', async (c) => {
    const licenseKey = extractLicenseKey(c);
    if (!licenseKey) {
      return c.json({ error: { message: 'Missing API key' } }, 401);
    }

    if (!config.googleApiKey) {
      return c.json({ error: { message: 'Google provider not configured' } }, 503);
    }

    // TODO: Validate license key against Supabase (Phase 1b/1c)
    // TODO: Check usage limits (Phase 1e)

    const upstreamPath = c.req.path.replace('/v1/google', '');
    const url = new URL(`${GOOGLE_BASE}${upstreamPath}`);
    // Google uses ?key= query parameter for auth
    url.searchParams.set('key', config.googleApiKey);

    return proxy(url.toString(), {
      ...c.req,
      headers: {
        ...c.req.header(),
        'x-api-key': undefined as unknown as string,
        'authorization': undefined as unknown as string,
        'host': 'generativelanguage.googleapis.com',
      },
    });
  });

  return app;
}
