import Stripe from 'stripe';
import type { ProxyConfig } from './config.js';

let instance: Stripe | null = null;

/**
 * Get the Stripe client singleton.
 */
export function getStripeClient(config: ProxyConfig): Stripe {
  if (!instance) {
    if (!config.stripeSecretKey) {
      throw new Error('Stripe secret key is required');
    }
    instance = new Stripe(config.stripeSecretKey);
  }
  return instance;
}
