import { Hono } from 'hono';
import type { ProxyConfig } from '../lib/config.js';
import { getSupabaseClient, getSupabaseAdmin } from '../lib/supabase.js';
import crypto from 'node:crypto';

/**
 * Auth routes -- thin wrapper around Supabase Auth.
 *
 * POST /auth/signup     -- Create account + generate license key
 * POST /auth/login      -- Email + password login
 * POST /auth/magic-link -- Passwordless email login
 * GET  /auth/me         -- User profile, subscription, usage
 */

/** Generate a unique license key */
function generateLicenseKey(): string {
  const bytes = crypto.randomBytes(24);
  return `sclw_${bytes.toString('base64url')}`;
}

export function createAuthRoutes(config: ProxyConfig) {
  const app = new Hono();

  // ── Sign up ───────────────────────────────────────────────────────
  app.post('/auth/signup', async (c) => {
    const body = await c.req.json<{ email: string; password: string }>();
    if (!body.email || !body.password) {
      return c.json({ error: 'Email and password are required' }, 400);
    }

    const supabase = getSupabaseClient(config);
    const { data, error } = await supabase.auth.signUp({
      email: body.email,
      password: body.password,
    });

    if (error) {
      return c.json({ error: error.message }, 400);
    }

    if (!data.user) {
      return c.json({ error: 'Signup failed' }, 500);
    }

    // Generate and store license key
    const admin = getSupabaseAdmin(config);
    const licenseKey = generateLicenseKey();
    const { error: keyError } = await admin
      .from('license_keys')
      .insert({
        user_id: data.user.id,
        key: licenseKey,
        active: true,
      });

    if (keyError) {
      console.error('Failed to create license key:', keyError);
      return c.json({ error: 'Account created but license key generation failed' }, 500);
    }

    // Create free subscription by default
    const { error: subError } = await admin
      .from('subscriptions')
      .insert({
        user_id: data.user.id,
        plan: 'free',
        status: 'active',
      });

    if (subError) {
      console.error('Failed to create subscription:', subError);
    }

    return c.json({
      user: {
        id: data.user.id,
        email: data.user.email,
      },
      licenseKey,
      session: data.session,
    });
  });

  // ── Login ─────────────────────────────────────────────────────────
  app.post('/auth/login', async (c) => {
    const body = await c.req.json<{ email: string; password: string }>();
    if (!body.email || !body.password) {
      return c.json({ error: 'Email and password are required' }, 400);
    }

    const supabase = getSupabaseClient(config);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: body.email,
      password: body.password,
    });

    if (error) {
      return c.json({ error: error.message }, 401);
    }

    // Fetch their license key
    const admin = getSupabaseAdmin(config);
    const { data: keyData } = await admin
      .from('license_keys')
      .select('key')
      .eq('user_id', data.user.id)
      .eq('active', true)
      .single();

    return c.json({
      user: {
        id: data.user.id,
        email: data.user.email,
      },
      licenseKey: keyData?.key || null,
      session: data.session,
    });
  });

  // ── Google OAuth ────────────────────────────────────────────────
  app.get('/auth/google', async (c) => {
    const supabase = getSupabaseClient(config);
    const redirectTo = c.req.query('redirect_to') || `${config.proxyUrl || 'https://proxy.simplestclaw.com'}/auth/callback`;

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
      },
    });

    if (error) {
      return c.json({ error: error.message }, 400);
    }

    return c.redirect(data.url);
  });

  // ── OAuth callback (handles Google, GitHub, etc.) ──────────────
  app.get('/auth/callback', async (c) => {
    const code = c.req.query('code');
    if (!code) {
      return c.json({ error: 'Missing auth code' }, 400);
    }

    const supabase = getSupabaseClient(config);
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error || !data.user) {
      return c.json({ error: error?.message || 'OAuth callback failed' }, 400);
    }

    // Check if license key exists, create one if not (first-time OAuth user)
    const admin = getSupabaseAdmin(config);
    const { data: existingKey } = await admin
      .from('license_keys')
      .select('key')
      .eq('user_id', data.user.id)
      .eq('active', true)
      .single();

    let licenseKey = existingKey?.key;

    if (!licenseKey) {
      // First-time user via OAuth -- create license key + subscription
      licenseKey = generateLicenseKey();
      await admin.from('license_keys').insert({
        user_id: data.user.id,
        key: licenseKey,
        active: true,
      });
      await admin.from('subscriptions').insert({
        user_id: data.user.id,
        plan: 'free',
        status: 'active',
      });
    }

    // Redirect to the desktop app via deep link
    const email = data.user.email || '';
    const deepLink = `simplestclaw://auth/callback?key=${encodeURIComponent(licenseKey)}&email=${encodeURIComponent(email)}`;

    // Return an HTML page that redirects to the deep link and shows a confirmation
    return c.html(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>simplestclaw</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{background:#0a0a0a;color:#fafafa;font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.c{text-align:center;max-width:400px;padding:2rem}.ok{width:64px;height:64px;border-radius:50%;background:rgba(16,185,129,.1);display:flex;align-items:center;justify-content:center;margin:0 auto 1.5rem}
h1{font-size:28px;font-weight:500;margin:0 0 .75rem}p{color:rgba(255,255,255,.5);font-size:15px;line-height:1.6;margin:0 0 2rem}
a{color:rgba(255,255,255,.4);font-size:14px;text-decoration:underline;text-underline-offset:4px}a:hover{color:rgba(255,255,255,.6)}</style>
</head><body><div class="c">
<div class="ok"><svg width="32" height="32" fill="none" stroke="#34d399" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg></div>
<h1>All set!</h1><p>You can return to simplestclaw now.</p>
<a href="${deepLink}">Didn't redirect? Click here</a>
</div><script>window.location.href="${deepLink}";</script></body></html>`);
  });

  // ── OAuth complete (called by web app after Google/OAuth sign-in) ──
  app.post('/auth/oauth-complete', async (c) => {
    const authHeader = c.req.header('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ error: 'Missing session token' }, 401);
    }

    const token = authHeader.slice(7);
    const supabase = getSupabaseClient(config);
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return c.json({ error: 'Invalid session' }, 401);
    }

    // Check if license key exists, create if not
    const admin = getSupabaseAdmin(config);
    const { data: existingKey } = await admin
      .from('license_keys')
      .select('key')
      .eq('user_id', user.id)
      .eq('active', true)
      .single();

    let licenseKey = existingKey?.key;

    if (!licenseKey) {
      licenseKey = generateLicenseKey();
      await admin.from('license_keys').insert({
        user_id: user.id,
        key: licenseKey,
        active: true,
      });
      await admin.from('subscriptions').insert({
        user_id: user.id,
        plan: 'free',
        status: 'active',
      });
    }

    return c.json({
      user: { id: user.id, email: user.email },
      licenseKey,
    });
  });

  // ── Magic link ────────────────────────────────────────────────────
  app.post('/auth/magic-link', async (c) => {
    const body = await c.req.json<{ email: string }>();
    if (!body.email) {
      return c.json({ error: 'Email is required' }, 400);
    }

    const supabase = getSupabaseClient(config);
    const { error } = await supabase.auth.signInWithOtp({
      email: body.email,
      options: {
        shouldCreateUser: true,
      },
    });

    if (error) {
      return c.json({ error: error.message }, 400);
    }

    return c.json({ message: 'Magic link sent. Check your email.' });
  });

  // ── Profile / me ──────────────────────────────────────────────────
  app.get('/auth/me', async (c) => {
    const authHeader = c.req.header('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ error: 'Missing session token' }, 401);
    }

    const token = authHeader.slice(7);
    const supabase = getSupabaseClient(config);
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return c.json({ error: 'Invalid session' }, 401);
    }

    // Fetch license key and subscription
    const admin = getSupabaseAdmin(config);
    const [keyResult, subResult, usageResult] = await Promise.all([
      admin
        .from('license_keys')
        .select('key')
        .eq('user_id', user.id)
        .eq('active', true)
        .single(),
      admin
        .from('subscriptions')
        .select('plan, status, current_period_end')
        .eq('user_id', user.id)
        .single(),
      admin
        .from('usage_logs')
        .select('input_tokens, output_tokens, cost_cents')
        .eq('user_id', user.id)
        .gte('created_at', new Date(new Date().setDate(1)).toISOString()), // Current month
    ]);

    // Sum usage for the current billing period
    const usage = (usageResult.data || []).reduce(
      (acc, row) => ({
        inputTokens: acc.inputTokens + (row.input_tokens || 0),
        outputTokens: acc.outputTokens + (row.output_tokens || 0),
        costCents: acc.costCents + (row.cost_cents || 0),
      }),
      { inputTokens: 0, outputTokens: 0, costCents: 0 },
    );

    return c.json({
      user: {
        id: user.id,
        email: user.email,
      },
      licenseKey: keyResult.data?.key || null,
      subscription: subResult.data || { plan: 'free', status: 'active' },
      usage,
    });
  });

  return app;
}
