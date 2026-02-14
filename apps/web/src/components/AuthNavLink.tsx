'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';

export function AuthNavLink({ className }: { className?: string }) {
  const [isSignedIn, setIsSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    const supabase = getSupabase();

    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsSignedIn(!!session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsSignedIn(!!session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Don't render anything until we know auth state to avoid flash
  if (isSignedIn === null) {
    return <span className={className}>Settings</span>;
  }

  if (isSignedIn) {
    return (
      <Link href="/settings" className={className}>
        Settings
      </Link>
    );
  }

  return (
    <Link href="/auth/login" className={className}>
      Sign in
    </Link>
  );
}
