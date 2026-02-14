import { Hono } from 'hono';
import type Stripe from 'stripe';
import type { ProxyConfig } from '../lib/config.js';
import { getStripeClient } from '../lib/stripe.js';
import { getSupabaseAdmin } from '../lib/supabase.js';

/**
 * Billing routes -- Stripe integration.
 *
 * POST /billing/create-checkout  -- Create Stripe Checkout session
 * POST /billing/webhook          -- Handle Stripe webhook events
 * GET  /billing/portal           -- Redirect to Stripe Customer Portal
 */

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

    const stripe = getStripeClient(config);

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: body.email,
      line_items: [{ price: body.priceId, quantity: 1 }],
      success_url: body.successUrl || 'https://simplestclaw.com/success',
      cancel_url: body.cancelUrl || 'https://simplestclaw.com/pricing',
      metadata: {
        userId: body.userId,
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
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;

        await admin
          .from('subscriptions')
          .update({
            plan: 'free',
            status: 'cancelled',
          })
          .eq('stripe_subscription_id', subscription.id);
        break;
      }
    }

    return c.json({ received: true });
  });

  // ── Customer portal ───────────────────────────────────────────────
  app.get('/billing/portal', async (c) => {
    const customerId = c.req.query('customer_id');
    if (!customerId) {
      return c.json({ error: 'customer_id is required' }, 400);
    }

    const stripe = getStripeClient(config);
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: 'https://simplestclaw.com/settings',
    });

    return c.json({ url: session.url });
  });

  return app;
}
