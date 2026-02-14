'use client';

import Link from 'next/link';
import { Suspense, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { getSupabase } from '@/lib/supabase';

const PROXY_URL = process.env.NEXT_PUBLIC_PROXY_URL || 'https://proxy.simplestclaw.com';

type AuthMode = 'login' | 'signup';

function AuthLoginPageContent() {
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [successEmail, setSuccessEmail] = useState('');
  const [successKey, setSuccessKey] = useState('');

  // Check if there's a redirect destination (e.g. /settings)
  const redirectTo = searchParams.get('redirect');

  /** After successful auth, either redirect to a web page or deep-link to desktop */
  const handleAuthSuccess = (licenseKey: string, userEmail: string) => {
    setSuccessEmail(userEmail);
    setSuccessKey(licenseKey);
    setSuccess(true);

    if (redirectTo) {
      // Web-based flow: redirect to the requested page (e.g. /settings)
      // The Supabase session is already stored in the browser, so the target page can use it
      window.location.href = redirectTo;
    } else {
      // Desktop flow: deep-link to the app
      window.location.href = `simplestclaw://auth/callback?key=${encodeURIComponent(licenseKey)}&email=${encodeURIComponent(userEmail)}`;
    }
  };

  // Handle OAuth callback -- when Supabase redirects back after Google sign-in
  useEffect(() => {
    const handleOAuthCallback = async () => {
      // Check for OAuth callback params
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const accessTokenFromHash = hashParams.get('access_token');

      if (!code && !accessTokenFromHash) return; // Not a callback, show login form

      setGoogleLoading(true);
      setError(null);

      try {
        let accessToken: string | null = null;
        let userEmail = '';

        if (code) {
          // PKCE flow -- exchange code for session
          const { data, error: exchangeError } = await getSupabase().auth.exchangeCodeForSession(code);
          if (exchangeError || !data.session) {
            setError(exchangeError?.message || 'Failed to complete sign-in.');
            setGoogleLoading(false);
            return;
          }
          accessToken = data.session.access_token;
          userEmail = data.session.user.email || '';
        } else if (accessTokenFromHash) {
          // Implicit flow -- token directly in hash
          const { data: { user }, error: userError } = await getSupabase().auth.getUser(accessTokenFromHash);
          if (userError || !user) {
            setError('Failed to complete sign-in.');
            setGoogleLoading(false);
            return;
          }
          accessToken = accessTokenFromHash;
          userEmail = user.email || '';
        }

        if (!accessToken) {
          setError('No authentication token received.');
          setGoogleLoading(false);
          return;
        }

        // Call proxy to ensure license key exists for this user
        const res = await fetch(`${PROXY_URL}/auth/oauth-complete`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
        });

        const data = await res.json();

        if (!res.ok) {
          setError(data.error || 'Failed to complete sign-in.');
          setGoogleLoading(false);
          return;
        }

        const licenseKey = data.licenseKey;

        // Clean up URL params
        window.history.replaceState({}, '', window.location.pathname);

        handleAuthSuccess(licenseKey, userEmail);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong.');
        setGoogleLoading(false);
      }
    };

    handleOAuthCallback();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setError(null);

    // Preserve the redirect param through the OAuth flow
    const callbackUrl = new URL(window.location.origin + window.location.pathname);
    if (redirectTo) {
      callbackUrl.searchParams.set('redirect', redirectTo);
    }

    const { error } = await getSupabase().auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: callbackUrl.toString(),
      },
    });

    if (error) {
      setError(error.message);
      setGoogleLoading(false);
    }
    // Browser will redirect to Google -- no need to setGoogleLoading(false)
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const endpoint = mode === 'signup' ? '/auth/signup' : '/auth/login';
      const res = await fetch(`${PROXY_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || `${mode === 'signup' ? 'Sign up' : 'Login'} failed`);
        setLoading(false);
        return;
      }

      const licenseKey = data.licenseKey || data.license_key;
      if (!licenseKey) {
        setError('No license key received. Please try again.');
        setLoading(false);
        return;
      }

      // Sign in via Supabase client so the session is stored in the browser
      // (needed for web-based flows like /settings)
      // For signup, the proxy already created the account, so we sign in to establish the session
      await getSupabase().auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      handleAuthSuccess(licenseKey, email.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Success state -- shown after redirect (only for desktop flow, web flow redirects immediately)
  if (success && !redirectTo) {
    return (
      <main className="min-h-screen bg-[#0a0a0a] text-[#fafafa] antialiased flex items-center justify-center p-6">
        <div className="w-full max-w-md text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h1 className="text-[28px] font-medium tracking-[-0.02em] mb-3">All set!</h1>
          <p className="text-[15px] text-white/50 leading-relaxed mb-4">
            You can return to simplestclaw now.
          </p>

          {successEmail && (
            <p className="text-[13px] text-white/30 mb-6">
              Signed in as {successEmail}
            </p>
          )}

          <a
            href={`simplestclaw://auth/callback?key=${encodeURIComponent(successKey)}&email=${encodeURIComponent(successEmail)}`}
            className="inline-block px-6 py-3 rounded-xl bg-white text-black text-[15px] font-medium hover:bg-white/90 transition-colors mb-6"
          >
            Open simplestclaw
          </a>

          <p className="text-[13px] text-white/30 mb-6">
            If the app didn&apos;t open automatically, click the button above.
          </p>

          {/* License key for manual entry fallback */}
          {successKey && (
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/10 text-left">
              <p className="text-[12px] text-white/30 mb-2">Or paste this license key in the app:</p>
              <code
                className="block w-full px-3 py-2 rounded-lg bg-white/[0.04] text-[13px] text-white/60 font-mono break-all select-all cursor-text"
                onClick={(e) => {
                  const range = document.createRange();
                  range.selectNodeContents(e.currentTarget);
                  window.getSelection()?.removeAllRanges();
                  window.getSelection()?.addRange(range);
                  navigator.clipboard.writeText(successKey);
                }}
              >
                {successKey}
              </code>
              <p className="text-[11px] text-white/20 mt-1.5">Click to copy</p>
            </div>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-[#fafafa] antialiased flex items-center justify-center p-6">
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0a0a0a]/80 backdrop-blur-md border-b border-white/5">
        <div className="max-w-[1400px] mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-1">
            <img src="/logo.png" alt="SimplestClaw" className="w-5 h-5 mt-0.5" />
            <span className="text-[15px] font-medium tracking-tight">simplestclaw</span>
          </Link>
        </div>
      </nav>

      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-[28px] font-medium tracking-[-0.02em] mb-3">
            {mode === 'login' ? 'Sign in to simplestclaw' : 'Create your account'}
          </h1>
          <p className="text-[15px] text-white/50 leading-relaxed">
            {mode === 'login'
              ? 'Sign in to connect your desktop app.'
              : 'Create an account to get started.'}
          </p>
        </div>

        {/* Google Sign In */}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={googleLoading}
          className="w-full py-3 rounded-xl border border-white/10 bg-white/[0.02] text-[15px] font-medium text-white/80 hover:bg-white/[0.05] hover:border-white/20 transition-all flex items-center justify-center gap-3 mb-6 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {googleLoading ? (
            <>
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M12 2v4m0 12v4m-7.07-3.07l2.83-2.83m8.49-8.49l2.83-2.83M2 12h4m12 0h4m-3.07 7.07l-2.83-2.83M7.76 7.76L4.93 4.93" />
              </svg>
              Connecting...
            </>
          ) : (
            <>
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Continue with Google
            </>
          )}
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="flex-1 h-px bg-white/10" />
          <span className="text-[12px] text-white/30">or</span>
          <div className="flex-1 h-px bg-white/10" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 mb-6">
          <div>
            <label htmlFor="email" className="text-[13px] text-white/40 mb-1.5 block">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoFocus
              required
              className="w-full px-4 py-3 rounded-xl bg-white/[0.02] border border-white/10 text-[15px] placeholder-white/30 focus:outline-none focus:border-white/20 transition-colors"
              disabled={loading}
            />
          </div>
          <div>
            <label htmlFor="password" className="text-[13px] text-white/40 mb-1.5 block">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'signup' ? 'At least 6 characters' : 'Your password'}
              required
              className="w-full px-4 py-3 rounded-xl bg-white/[0.02] border border-white/10 text-[15px] placeholder-white/30 focus:outline-none focus:border-white/20 transition-colors"
              disabled={loading}
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-[13px] text-red-400">
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!email.trim() || !password.trim() || loading}
            className={`w-full py-3 rounded-xl text-[15px] font-medium transition-all flex items-center justify-center gap-2 ${
              email.trim() && password.trim() && !loading
                ? 'bg-white text-black hover:bg-white/90'
                : 'bg-white/5 text-white/30 cursor-not-allowed'
            }`}
          >
            {loading ? (
              <>
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M12 2v4m0 12v4m-7.07-3.07l2.83-2.83m8.49-8.49l2.83-2.83M2 12h4m12 0h4m-3.07 7.07l-2.83-2.83M7.76 7.76L4.93 4.93" />
                </svg>
                {mode === 'login' ? 'Signing in...' : 'Creating account...'}
              </>
            ) : (
              mode === 'login' ? 'Sign in' : 'Create account'
            )}
          </button>
        </form>

        <div className="text-center">
          {mode === 'login' ? (
            <p className="text-[14px] text-white/40">
              Don't have an account?{' '}
              <button
                type="button"
                onClick={() => { setMode('signup'); setError(null); }}
                className="text-white/60 hover:text-white/80 transition-colors underline underline-offset-4"
              >
                Sign up
              </button>
            </p>
          ) : (
            <p className="text-[14px] text-white/40">
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => { setMode('login'); setError(null); }}
                className="text-white/60 hover:text-white/80 transition-colors underline underline-offset-4"
              >
                Sign in
              </button>
            </p>
          )}
        </div>
      </div>
    </main>
  );
}

export default function AuthLoginPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#0a0a0a] text-[#fafafa] antialiased flex items-center justify-center">
          <div className="flex items-center gap-3 text-white/40">
            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M12 2v4m0 12v4m-7.07-3.07l2.83-2.83m8.49-8.49l2.83-2.83M2 12h4m12 0h4m-3.07 7.07l-2.83-2.83M7.76 7.76L4.93 4.93" />
            </svg>
            <span className="text-[15px]">Loading...</span>
          </div>
        </main>
      }
    >
      <AuthLoginPageContent />
    </Suspense>
  );
}
