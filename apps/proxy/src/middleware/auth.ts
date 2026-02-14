import type { Context, Next } from 'hono';

/**
 * License key validation middleware.
 *
 * Extracts the license key from the request (sent by OpenClaw as the "API key"),
 * validates it against the database, and attaches the user to the context.
 *
 * This middleware will be wired into the proxy routes in Phase 1c
 * when Supabase is connected.
 */

export interface AuthUser {
  id: string;
  email: string;
  licenseKey: string;
  plan: 'free' | 'pro';
  active: boolean;
}

/**
 * Validate a license key and return the associated user.
 * Currently a stub -- will query Supabase in Phase 1b/1c.
 */
export async function validateLicenseKey(key: string): Promise<AuthUser | null> {
  // TODO: Query Supabase license_keys table
  // SELECT lk.*, s.plan, s.status
  // FROM license_keys lk
  // LEFT JOIN subscriptions s ON s.user_id = lk.user_id
  // WHERE lk.key = $1 AND lk.active = true

  // For development: accept any key that starts with "sclw-"
  if (key.startsWith('sclw-')) {
    return {
      id: 'dev-user',
      email: 'dev@simplestclaw.com',
      licenseKey: key,
      plan: 'pro',
      active: true,
    };
  }

  return null;
}

/**
 * Hono middleware that validates the license key on proxy routes.
 * Attaches the AuthUser to the context variable 'user'.
 */
export async function authMiddleware(c: Context, next: Next) {
  // Extract key from x-api-key or Authorization: Bearer headers
  const xApiKey = c.req.header('x-api-key');
  const authHeader = c.req.header('authorization');
  const key = xApiKey || (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null);

  if (!key) {
    return c.json({ error: { message: 'Missing license key' } }, 401);
  }

  const user = await validateLicenseKey(key);
  if (!user) {
    return c.json({ error: { message: 'Invalid license key' } }, 403);
  }

  if (!user.active) {
    return c.json({ error: { message: 'License key is deactivated' } }, 403);
  }

  c.set('user', user);
  await next();
}
