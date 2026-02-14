import { Hono } from 'hono';
import type Stripe from 'stripe';
import type { ProxyConfig } from '../lib/config.js';
import { invalidateLicenseKey } from '../lib/license-cache.js';
import { getStripeClient } from '../lib/stripe.js';
import { getSupabaseAdmin, getSupabaseClient } from '../lib/supabase.js';

/**
 * Billing routes -- Stripe integration.
 *
 * POST /billing/create-checkout  -- Create Stripe Checkout session
 * POST /billing/webhook          -- Handle Stripe webhook events
 * GET  /billing/portal           -- Redirect to Stripe Customer Portal
 * GET  /billing/account          -- Get account info (subscription, usage)
 * POST /billing/upgrade          -- Create checkout session for authenticated users
 */

// ── Input validation helpers ────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^.+@.+\..+$/;
const STRIPE_PRICE_RE = /^price_/;
const STRIPE_CUSTOMER_RE = /^cus_/;
const LICENSE_KEY_RE = /^sclw_/;

/** Allowed URL origins for checkout redirect URLs */
const PROD_URL_PATTERNS = [
  /^https:\/\/([\w-]+\.)?simplestclaw\.com(\/|$)/,
];
const DEV_URL_PATTERNS = [
  ...PROD_URL_PATTERNS,
  /^http:\/\/localhost(:\d+)?(\/|$)/,
];

function isAllowedUrl(url: string, nodeEnv: string): boolean {
  const patterns = nodeEnv === 'production' ? PROD_URL_PATTERNS : DEV_URL_PATTERNS;
  return patterns.some((pattern) => pattern.test(url));
}

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Invalidate all cached license keys for a user so plan changes take effect immediately.
 * Called after webhook handlers update the subscription in the DB.
 */
async function invalidateUserLicenseCache(config: ProxyConfig, userId: string): Promise<void> {
  try {
    const admin = getSupabaseAdmin(config);
    const { data: keys } = await admin
      .from('license_keys')
      .select('key')
      .eq('user_id', userId)
      .eq('active', true);

    if (keys) {
      for (const row of keys) {
        invalidateLicenseKey(row.key);
      }
    }
  } catch (err) {
    // Non-fatal: cache will expire naturally within 5 minutes
    console.error('[billing] Failed to invalidate license cache for user:', userId, err);
  }
}

/**
 * Resolve a Stripe subscription ID to a user ID via the subscriptions table.
 */
async function resolveUserFromSubscription(config: ProxyConfig, stripeSubscriptionId: string): Promise<string | null> {
  const admin = getSupabaseAdmin(config);
  const { data } = await admin
    .from('subscriptions')
    .select('user_id')
    .eq('stripe_subscription_id', stripeSubscriptionId)
    .single();
  return data?.user_id || null;
}

/** Resolve a license key to a user ID */
async function resolveUserFromLicenseKey(config: ProxyConfig, licenseKey: string) {
  const admin = getSupabaseAdmin(config);
  const { data } = await admin
    .from('license_keys')
    .select('user_id')
    .eq('key', licenseKey)
    .eq('active', true)
    .single();
  return data?.user_id || null;
}

export function createBillingRoutes(config: ProxyConfig) {
  const app = new Hono();

  // ── Create checkout session ───────────────────────────────────────
  app.post('/billing/create-checkout', async (c) => {
    const body = await c.req.json<{
      userId: string;
      email: string;
      priceId: string;
      successUrl: string;
      cancelUrl: string;
    }>();

    if (!body.userId || !body.priceId) {
      return c.json({ error: 'userId and priceId are required' }, 400);
    }

    // Validate userId is a UUID
    if (!UUID_RE.test(body.userId)) {
      return c.json({ error: 'Invalid userId format' }, 400);
    }

    // Validate email if provided
    if (body.email && !EMAIL_RE.test(body.email)) {
      return c.json({ error: 'Invalid email format' }, 400);
    }

    // Validate priceId is a Stripe price AND matches our configured prices.
    // This prevents a caller from passing arbitrary price IDs from our Stripe account.
    if (!STRIPE_PRICE_RE.test(body.priceId)) {
      return c.json({ error: 'Invalid priceId format' }, 400);
    }
    const allowedPrices = new Set([config.stripeProPriceId].filter(Boolean));
    if (!allowedPrices.has(body.priceId)) {
      return c.json({ error: 'Price not available' }, 400);
    }

    // Validate redirect URLs to prevent open redirect attacks
    const successUrl = body.successUrl || 'https://simplestclaw.com/settings?upgraded=true';
    const cancelUrl = body.cancelUrl || 'https://simplestclaw.com/settings';

    if (!isAllowedUrl(successUrl, config.nodeEnv)) {
      return c.json({ error: 'Invalid successUrl domain' }, 400);
    }
    if (!isAllowedUrl(cancelUrl, config.nodeEnv)) {
      return c.json({ error: 'Invalid cancelUrl domain' }, 400);
    }

    const stripe = getStripeClient(config);

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: body.email,
      line_items: [{ price: body.priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        userId: body.userId,
      },
    });

    return c.json({ url: session.url });
  });

  // ── Upgrade (authenticated via Supabase token) ────────────────────
  app.post('/billing/upgrade', async (c) => {
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

    const admin = getSupabaseAdmin(config);

    // Get or create Stripe customer
    const { data: sub } = await admin
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .single();

    const stripe = getStripeClient(config);
    let customerId = sub?.stripe_customer_id;

    if (!customerId) {
      // Create a Stripe customer
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId: user.id },
      });
      customerId = customer.id;

      // Store in DB
      await admin
        .from('subscriptions')
        .upsert({
          user_id: user.id,
          stripe_customer_id: customerId,
        }, { onConflict: 'user_id' });
    }

    if (!config.stripeProPriceId) {
      return c.json({ error: 'Pro plan price not configured' }, 503);
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: config.stripeProPriceId, quantity: 1 }],
      success_url: 'https://simplestclaw.com/settings?upgraded=true',
      cancel_url: 'https://simplestclaw.com/settings',
      metadata: {
        userId: user.id,
      },
    });

    return c.json({ url: session.url });
  });

  // ── Stripe webhook ────────────────────────────────────────────────
  app.post('/billing/webhook', async (c) => {
    const stripe = getStripeClient(config);
    const signature = c.req.header('stripe-signature');

    if (!signature || !config.stripeWebhookSecret) {
      return c.json({ error: 'Missing signature' }, 400);
    }

    const rawBody = await c.req.text();

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        rawBody,
        signature,
        config.stripeWebhookSecret,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('Webhook signature verification failed:', message);
      return c.json({ error: 'Invalid signature' }, 400);
    }

    const admin = getSupabaseAdmin(config);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.metadata?.userId;
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;

        if (userId) {
          await admin
            .from('subscriptions')
            .upsert({
              user_id: userId,
              stripe_customer_id: customerId,
              stripe_subscription_id: subscriptionId,
              plan: 'pro',
              status: 'active',
            }, { onConflict: 'user_id' });

          // Immediately reflect Pro access -- don't wait for cache TTL
          await invalidateUserLicenseCache(config, userId);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const status = subscription.status;

        await admin
          .from('subscriptions')
          .update({
            status: status === 'active' ? 'active' : 'inactive',
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
          })
          .eq('stripe_subscription_id', subscription.id);

        const updatedUserId = await resolveUserFromSubscription(config, subscription.id);
        if (updatedUserId) await invalidateUserLicenseCache(config, updatedUserId);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;

        // Resolve user before updating (need the sub row to still exist)
        const deletedUserId = await resolveUserFromSubscription(config, subscription.id);

        await admin
          .from('subscriptions')
          .update({
            plan: 'free',
            status: 'cancelled',
          })
          .eq('stripe_subscription_id', subscription.id);

        if (deletedUserId) await invalidateUserLicenseCache(config, deletedUserId);
        break;
      }

      case 'invoice.payment_failed': {
        // A renewal payment failed. Mark the subscription as past_due so
        // the rate limiter / model access logic can restrict the user.
        // Stripe will continue retrying per your retry settings, and if
        // it eventually succeeds we'll get invoice.payment_succeeded.
        // If all retries fail, Stripe sends customer.subscription.deleted.
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = typeof invoice.subscription === 'string'
          ? invoice.subscription
          : invoice.subscription?.id;

        if (subscriptionId) {
          await admin
            .from('subscriptions')
            .update({
              status: 'past_due',
            })
            .eq('stripe_subscription_id', subscriptionId);

          console.warn(`[billing] Payment failed for subscription ${subscriptionId}`);

          const failedUserId = await resolveUserFromSubscription(config, subscriptionId);
          if (failedUserId) await invalidateUserLicenseCache(config, failedUserId);
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        // A renewal payment succeeded. Ensure the subscription is active
        // and update the billing period dates.
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = typeof invoice.subscription === 'string'
          ? invoice.subscription
          : invoice.subscription?.id;

        if (subscriptionId && invoice.lines?.data?.[0]) {
          const line = invoice.lines.data[0];
          await admin
            .from('subscriptions')
            .update({
              status: 'active',
              current_period_start: new Date((line.period?.start ?? 0) * 1000).toISOString(),
              current_period_end: new Date((line.period?.end ?? 0) * 1000).toISOString(),
            })
            .eq('stripe_subscription_id', subscriptionId);

          const succeededUserId = await resolveUserFromSubscription(config, subscriptionId);
          if (succeededUserId) await invalidateUserLicenseCache(config, succeededUserId);
        }
        break;
      }
    }

    return c.json({ received: true });
  });

  // ── Customer portal (accepts license_key or customer_id) ──────────
  app.get('/billing/portal', async (c) => {
    let customerId = c.req.query('customer_id');

    // Validate customer_id format if provided
    if (customerId && !STRIPE_CUSTOMER_RE.test(customerId)) {
      return c.json({ error: 'Invalid customer_id format' }, 400);
    }

    // Also accept license_key and resolve it to a Stripe customer ID
    const licenseKey = c.req.query('license_key');
    if (!customerId && licenseKey) {
      // Validate license key format
      if (!LICENSE_KEY_RE.test(licenseKey)) {
        return c.json({ error: 'Invalid license key format' }, 400);
      }

      const userId = await resolveUserFromLicenseKey(config, licenseKey);
      if (!userId) {
        return c.json({ error: 'Invalid license key' }, 401);
      }
      const admin = getSupabaseAdmin(config);
      const { data: sub } = await admin
        .from('subscriptions')
        .select('stripe_customer_id')
        .eq('user_id', userId)
        .single();
      customerId = sub?.stripe_customer_id || null;
    }

    // Also accept Supabase session token
    const authHeader = c.req.header('authorization');
    if (!customerId && authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const supabase = getSupabaseClient(config);
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) {
        const admin = getSupabaseAdmin(config);
        const { data: sub } = await admin
          .from('subscriptions')
          .select('stripe_customer_id')
          .eq('user_id', user.id)
          .single();
        customerId = sub?.stripe_customer_id || null;
      }
    }

    if (!customerId) {
      return c.json({ error: 'No Stripe customer found. You may need to upgrade first.' }, 400);
    }

    const stripe = getStripeClient(config);
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: 'https://simplestclaw.com/settings',
    });

    // Return URL as JSON (avoids CORS issues with cross-origin redirects to Stripe)
    return c.json({ url: session.url });
  });

  // ── Account info (for web dashboard) ──────────────────────────────
  app.get('/billing/account', async (c) => {
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

    const admin = getSupabaseAdmin(config);

    // Fetch subscription, license key, and usage in parallel
    const [subResult, keyResult, usageResult] = await Promise.all([
      admin
        .from('subscriptions')
        .select('plan, status, stripe_customer_id, stripe_subscription_id, current_period_start, current_period_end')
        .eq('user_id', user.id)
        .single(),
      admin
        .from('license_keys')
        .select('key')
        .eq('user_id', user.id)
        .eq('active', true)
        .single(),
      admin
        .from('usage_logs')
        .select('input_tokens, output_tokens, cost_cents, provider, model, created_at')
        .eq('user_id', user.id)
        .gte('created_at', new Date(new Date().setDate(1)).toISOString()),
    ]);

    const subscription = subResult.data || {
      plan: 'free' as const,
      status: 'active' as const,
      stripe_customer_id: null as string | null,
      stripe_subscription_id: null as string | null,
      current_period_start: null as string | null,
      current_period_end: null as string | null,
    };

    // Sum usage for the current billing period
    const usageLogs = usageResult.data || [];
    const usage = usageLogs.reduce(
      (acc, row) => ({
        inputTokens: acc.inputTokens + (row.input_tokens || 0),
        outputTokens: acc.outputTokens + (row.output_tokens || 0),
        costCents: acc.costCents + (row.cost_cents || 0),
        messageCount: acc.messageCount + 1,
      }),
      { inputTokens: 0, outputTokens: 0, costCents: 0, messageCount: 0 },
    );

    // Daily message count (for limit display)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const messagesToday = usageLogs.filter(
      (row) => new Date(row.created_at) >= todayStart,
    ).length;

    const dailyLimit = subscription.plan === 'pro' ? 500 : 10;

    return c.json({
      user: {
        id: user.id,
        email: user.email,
        createdAt: user.created_at,
      },
      subscription: {
        plan: subscription.plan,
        status: subscription.status,
        hasStripeCustomer: !!subscription.stripe_customer_id,
        currentPeriodEnd: subscription.current_period_end,
      },
      licenseKey: keyResult.data?.key || null,
      usage: {
        ...usage,
        messagesToday,
        dailyLimit,
      },
    });
  });

  return app;
}
