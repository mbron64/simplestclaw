import { Hono } from 'hono';
import { proxy } from 'hono/proxy';
import type { ProxyConfig } from '../lib/config.js';
import { resolveLicenseKey, type CachedLicense } from '../lib/license-cache.js';
import { checkAndIncrement, type RateLimitResult } from '../lib/rate-limiter.js';
import {
  extractAnthropicUsage,
  extractOpenAIUsage,
  extractGoogleUsage,
  logUsage,
} from '../lib/usage-logger.js';

/**
 * Provider proxy routes.
 *
 * OpenClaw gateway sends requests here (configured via models.providers in openclaw.json).
 * The gateway thinks it's talking to Anthropic/OpenAI directly, but the "API key" is
 * actually the user's license key. We validate it, swap for the real provider key,
 * and forward the request. Streaming responses pass through transparently.
 *
 * Security layers (applied to every request):
 *  1. License key validation -- verified against Supabase (cached 5 min)
 *  2. Rate limiting -- daily message limits enforced per plan
 *  3. Model access control -- Free users restricted to allowed models
 *  4. Usage logging -- token counts logged async after response
 *
 * Endpoints:
 *   POST /v1/anthropic/v1/messages  -- Anthropic Messages API
 *   POST /v1/openai/v1/chat/completions  -- OpenAI Chat Completions API
 *   POST /v1/google/*  -- Google Gemini API
 */

// Upstream provider base URLs
const ANTHROPIC_BASE = 'https://api.anthropic.com';
const OPENAI_BASE = 'https://api.openai.com';
const GOOGLE_BASE = 'https://generativelanguage.googleapis.com';

/**
 * Sanitize the upstream path after stripping our prefix.
 * Prevents path traversal attacks (e.g. /v1/anthropic/../../admin).
 * Returns null if the path is malicious.
 */
function sanitizeUpstreamPath(rawPath: string, prefix: string): string | null {
  const stripped = rawPath.replace(prefix, '');
  // Reject path traversal attempts and double-slash tricks
  if (stripped.includes('..') || stripped.includes('//')) {
    return null;
  }
  // Ensure it starts with /
  return stripped.startsWith('/') ? stripped : `/${stripped}`;
}

// All models available on the platform (reject anything not in this set).
// Keep in sync with @simplestclaw/models (packages/models/src/index.ts)
const AVAILABLE_MODELS = new Set([
  'claude-opus-4-5-20251124',
  'claude-opus-4-5',    // alias
  'claude-sonnet-4-5-20250929',
  'claude-sonnet-4-5',  // alias
  'claude-haiku-4-5-20251001',
  'claude-haiku-4-5',   // alias
  'gpt-5.2',
  'gpt-5-mini',
  'gemini-3-pro-preview',
  'gemini-3-flash-preview',
]);

// Models that Free plan users can access (subset of AVAILABLE_MODELS)
const FREE_MODELS = new Set([
  'claude-sonnet-4-5-20250929',
  'claude-sonnet-4-5',  // alias
  'gpt-5-mini',
]);

// Models that require Ultra plan (not available on Pro)
const ULTRA_ONLY_MODELS = new Set([
  'claude-opus-4-5-20251124',
  'claude-opus-4-5',    // alias
  'gpt-5.2',
]);

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

/**
 * Try to extract the model name from the request body.
 * IMPORTANT: Clones the request before reading to avoid consuming the body stream,
 * which is needed later by proxy() to forward the request upstream.
 * Returns null if the body can't be parsed or doesn't contain a model field.
 */
async function extractModelFromBody(c: { req: { raw: Request } }): Promise<string | null> {
  try {
    // Clone so the original body stream remains unconsumed for proxy()
    const cloned = c.req.raw.clone();
    const body = await cloned.json();
    return (body.model as string) || null;
  } catch {
    return null;
  }
}

/**
 * Check if a model is allowed for a given plan.
 * First: reject models not on the platform at all.
 * Then: Ultra gets all, Pro gets all except ultra-only, Free gets a subset.
 */
function isModelAllowed(model: string | null, plan: string): boolean {
  if (!model) return true; // Can't determine model, allow (provider will reject if invalid)

  // Check model is on the platform at all
  const isAvailable = AVAILABLE_MODELS.has(model) ||
    [...AVAILABLE_MODELS].some((m) => model.startsWith(m));
  if (!isAvailable) return false;

  // Ultra users can use any available model
  if (plan === 'ultra') return true;

  // Check if model is ultra-only
  const isUltraOnly = ULTRA_ONLY_MODELS.has(model) ||
    [...ULTRA_ONLY_MODELS].some((m) => model.startsWith(m));
  if (isUltraOnly) return false;

  // Pro users can use any non-ultra model
  if (plan === 'pro') return true;

  // Free users: only specific models
  for (const freeModel of FREE_MODELS) {
    if (model === freeModel || model.startsWith(freeModel)) {
      return true;
    }
  }
  return false;
}

/**
 * Add rate limit headers to a Response.
 */
function addRateLimitHeaders(headers: Headers, rateLimit: RateLimitResult): void {
  headers.set('X-RateLimit-Limit', String(rateLimit.limit));
  headers.set('X-RateLimit-Remaining', String(rateLimit.remaining));
  headers.set('X-RateLimit-Reset', String(rateLimit.resetAt));
}

/**
 * Validate the license key and check rate limits.
 * Returns the license info + rate limit result, or a Response to return early (error).
 */
async function validateAndCheckLimits(
  config: ProxyConfig,
  licenseKey: string,
  model: string | null,
): Promise<
  | { ok: true; license: CachedLicense; rateLimit: RateLimitResult }
  | { ok: false; response: Response }
> {
  // 1. Validate license key
  const license = await resolveLicenseKey(config, licenseKey);
  if (!license) {
    return {
      ok: false,
      response: Response.json(
        {
          error: {
            message: 'Invalid or inactive license key. Please sign in again at simplestclaw.com.',
            type: 'authentication_error',
          },
        },
        { status: 401 },
      ),
    };
  }

  // 2. Check model access
  if (!isModelAllowed(model, license.plan)) {
    let upgradeMsg = '';
    if (license.plan === 'free') {
      upgradeMsg = ' Upgrade to Pro at simplestclaw.com/settings for access to more models.';
    } else if (license.plan === 'pro') {
      upgradeMsg = ' Upgrade to Ultra at simplestclaw.com/settings for access to all models including Opus 4.5 and GPT-5.2.';
    }
    return {
      ok: false,
      response: Response.json(
        {
          error: {
            message: `Model "${model}" is not available on the ${license.plan} plan.${upgradeMsg}`,
            type: 'permission_error',
          },
        },
        { status: 403 },
      ),
    };
  }

  // 3. Check rate limit
  const rateLimit = checkAndIncrement(license.userId, license.plan);
  if (!rateLimit.allowed) {
    let upgradeMsg = '';
    if (license.plan === 'free') {
      upgradeMsg = ' Upgrade to Pro for 200 messages/day at simplestclaw.com/settings.';
    } else if (license.plan === 'pro') {
      upgradeMsg = ' Upgrade to Ultra for 2000 messages/day at simplestclaw.com/settings.';
    }
    const errorResponse = Response.json(
      {
        error: {
          message: `Daily message limit reached (${rateLimit.limit}/${rateLimit.limit}).${upgradeMsg}`,
          type: 'rate_limit_error',
        },
      },
      { status: 429 },
    );
    addRateLimitHeaders(errorResponse.headers, rateLimit);
    return { ok: false, response: errorResponse };
  }

  return { ok: true, license, rateLimit };
}

/**
 * Allowlist of response headers to forward from upstream providers.
 * Prevents leaking provider-internal headers to the client.
 */
const ALLOWED_RESPONSE_HEADERS = new Set([
  'content-type',
  'content-length',
  'transfer-encoding',
  'content-encoding',
  'cache-control',
  'x-ratelimit-limit',
  'x-ratelimit-remaining',
  'x-ratelimit-reset',
  'retry-after',
  'x-request-id',
  'request-id',
]);

/** Filter response headers through the allowlist */
function filterResponseHeaders(upstream: Headers): Headers {
  const filtered = new Headers();
  for (const [key, value] of upstream.entries()) {
    if (ALLOWED_RESPONSE_HEADERS.has(key.toLowerCase())) {
      filtered.set(key, value);
    }
  }
  return filtered;
}

/**
 * Intercept and clone a streaming/non-streaming response to extract usage data,
 * then log it asynchronously. Returns the original response untouched.
 */
function interceptAndLogUsage(
  config: ProxyConfig,
  response: Response,
  userId: string,
  provider: string,
  model: string,
  rateLimit: RateLimitResult,
  extractUsage: (body: string) => { inputTokens: number; outputTokens: number } | null,
): Response {
  // Filter upstream headers through allowlist, then add our rate limit headers
  const headers = filterResponseHeaders(response.headers);
  addRateLimitHeaders(headers, rateLimit);

  // If the response has no body or is an error, just pass through
  if (!response.body || !response.ok) {
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  const contentType = response.headers.get('content-type') || '';
  const isStreaming = contentType.includes('text/event-stream');

  if (isStreaming) {
    // For streaming responses, we tee the stream:
    // one leg goes to the client, the other we read to extract usage
    const [clientStream, logStream] = response.body.tee();

    // Read the log stream in the background to extract usage
    const reader = logStream.getReader();
    const chunks: Uint8Array[] = [];

    const readAll = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) chunks.push(value);
        }
        const decoder = new TextDecoder();
        const fullBody = chunks.map((c) => decoder.decode(c, { stream: true })).join('') + decoder.decode();
        const usage = extractUsage(fullBody);
        // Always log usage -- even if token extraction fails, we record the message
        logUsage(config, userId, provider, model, usage || { inputTokens: 0, outputTokens: 0 });
      } catch (err) {
        console.error(`[proxy] Error reading stream for usage logging:`, err);
        // Still log a record so the message is counted on the dashboard
        logUsage(config, userId, provider, model, { inputTokens: 0, outputTokens: 0 });
      }
    };
    readAll();

    return new Response(clientStream, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  // Non-streaming: clone the response, read the clone for usage
  const cloned = response.clone();
  cloned.text().then((body) => {
    const usage = extractUsage(body);
    // Always log usage -- even if token extraction fails, we record the message
    logUsage(config, userId, provider, model, usage || { inputTokens: 0, outputTokens: 0 });
  }).catch((err) => {
    console.error(`[proxy] Error reading response for usage logging:`, err);
    // Still log a record so the message is counted on the dashboard
    logUsage(config, userId, provider, model, { inputTokens: 0, outputTokens: 0 });
  });

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
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

    // Extract model from body for access control
    const model = await extractModelFromBody(c);

    // Validate license + check rate limits + model access
    const check = await validateAndCheckLimits(config, licenseKey, model);
    if (!check.ok) {
      return check.response;
    }

    // Strip our prefix to get the real Anthropic path
    // /v1/anthropic/v1/messages -> /v1/messages
    const upstreamPath = sanitizeUpstreamPath(c.req.path, '/v1/anthropic');
    if (!upstreamPath) {
      return c.json({ error: { message: 'Invalid request path' } }, 400);
    }
    const upstreamUrl = `${ANTHROPIC_BASE}${upstreamPath}`;

    // Forward with real API key, preserving all other headers
    const response = await proxy(upstreamUrl, {
      ...c.req,
      headers: {
        ...c.req.header(),
        'x-api-key': config.anthropicApiKey,
        'authorization': undefined as unknown as string, // Remove license key
        'host': 'api.anthropic.com',
      },
    });

    // Log usage async (non-blocking)
    return interceptAndLogUsage(
      config,
      response as unknown as Response,
      check.license.userId,
      'anthropic',
      model || 'unknown',
      check.rateLimit,
      extractAnthropicUsage,
    );
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

    // Extract model from body for access control
    const model = await extractModelFromBody(c);

    // Validate license + check rate limits + model access
    const check = await validateAndCheckLimits(config, licenseKey, model);
    if (!check.ok) {
      return check.response;
    }

    // Strip our prefix to get the real OpenAI path
    // /v1/openai/v1/chat/completions -> /v1/chat/completions
    const upstreamPath = sanitizeUpstreamPath(c.req.path, '/v1/openai');
    if (!upstreamPath) {
      return c.json({ error: { message: 'Invalid request path' } }, 400);
    }
    const upstreamUrl = `${OPENAI_BASE}${upstreamPath}`;

    const response = await proxy(upstreamUrl, {
      ...c.req,
      headers: {
        ...c.req.header(),
        'authorization': `Bearer ${config.openaiApiKey}`,
        'host': 'api.openai.com',
      },
    });

    // Log usage async (non-blocking)
    return interceptAndLogUsage(
      config,
      response as unknown as Response,
      check.license.userId,
      'openai',
      model || 'unknown',
      check.rateLimit,
      extractOpenAIUsage,
    );
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

    // Extract model from body for access control
    const model = await extractModelFromBody(c);

    // Validate license + check rate limits + model access
    const check = await validateAndCheckLimits(config, licenseKey, model);
    if (!check.ok) {
      return check.response;
    }

    const upstreamPath = sanitizeUpstreamPath(c.req.path, '/v1/google');
    if (!upstreamPath) {
      return c.json({ error: { message: 'Invalid request path' } }, 400);
    }
    const url = new URL(`${GOOGLE_BASE}${upstreamPath}`);
    // Google uses ?key= query parameter for auth
    url.searchParams.set('key', config.googleApiKey);

    const response = await proxy(url.toString(), {
      ...c.req,
      headers: {
        ...c.req.header(),
        'x-api-key': undefined as unknown as string,
        'authorization': undefined as unknown as string,
        'host': 'generativelanguage.googleapis.com',
      },
    });

    // Log usage async (non-blocking)
    return interceptAndLogUsage(
      config,
      response as unknown as Response,
      check.license.userId,
      'google',
      model || 'unknown',
      check.rateLimit,
      extractGoogleUsage,
    );
  });

  return app;
}
