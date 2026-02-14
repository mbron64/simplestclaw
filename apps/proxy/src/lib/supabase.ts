import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ProxyConfig } from './config.js';

let clientInstance: SupabaseClient | null = null;
let adminInstance: SupabaseClient | null = null;

/**
 * Get a Supabase client using the publishable (anon) key (for auth operations).
 */
export function getSupabaseClient(config: ProxyConfig): SupabaseClient {
  if (!clientInstance) {
    if (!config.supabaseUrl || !config.supabaseAnonKey) {
      throw new Error('Supabase URL and anon key are required');
    }
    clientInstance = createClient(config.supabaseUrl, config.supabaseAnonKey);
  }
  return clientInstance;
}

/**
 * Get a Supabase admin client using the secret (service role) key.
 * Bypasses Row Level Security -- use only on the server side.
 */
export function getSupabaseAdmin(config: ProxyConfig): SupabaseClient {
  if (!adminInstance) {
    if (!config.supabaseUrl || !config.supabaseServiceKey) {
      throw new Error('Supabase URL and service role key are required');
    }
    adminInstance = createClient(config.supabaseUrl, config.supabaseServiceKey);
  }
  return adminInstance;
}
