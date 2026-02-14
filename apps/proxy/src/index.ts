import 'dotenv/config';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { loadConfig } from './lib/config.js';
import { createProxyRoutes } from './routes/proxy.js';
import { createAuthRoutes } from './routes/auth.js';
import { createBillingRoutes } from './routes/billing.js';

const config = loadConfig();
const app = new Hono();

// ── Global middleware ─────────────────────────────────────────────────
app.use('*', logger());
app.use('*', cors({
  origin: ['https://simplestclaw.com', 'http://localhost:1420', 'http://localhost:3002', 'tauri://localhost'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'anthropic-version'],
  maxAge: 86400,
}));

// ── Health check ──────────────────────────────────────────────────────
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
  });
});

// ── Mount routes ──────────────────────────────────────────────────────
// Provider proxy (Anthropic, OpenAI, Google passthrough)
app.route('/', createProxyRoutes(config));

// Auth (signup, login, magic link, profile)
app.route('/', createAuthRoutes(config));

// Billing (Stripe checkout, webhooks, portal)
app.route('/', createBillingRoutes(config));

// ── 404 fallback ──────────────────────────────────────────────────────
app.notFound((c) => {
  return c.json({ error: 'Not found' }, 404);
});

// ── Error handler ─────────────────────────────────────────────────────
app.onError((err, c) => {
  console.error('[proxy] Unhandled error:', err);
  return c.json({ error: 'Internal server error' }, 500);
});

// ── Start server ──────────────────────────────────────────────────────
console.log(`[proxy] Starting on port ${config.port} (${config.nodeEnv})`);
serve({
  fetch: app.fetch,
  port: config.port,
});
console.log(`[proxy] Listening at http://localhost:${config.port}`);
