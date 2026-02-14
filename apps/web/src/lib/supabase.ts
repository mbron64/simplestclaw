import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _supabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (_supabase) return _supabase;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables');
  }

  _supabase = createClient(url, key);
  return _supabase;
}

// For backwards compat — safe to use in client components (runs in browser where env vars exist)
export const supabase = typeof window !== 'undefined'
  ? getSupabase()
  : (null as unknown as SupabaseClient);
