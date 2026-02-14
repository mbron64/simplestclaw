'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getSupabase } from '@/lib/supabase';

const PROXY_URL = process.env.NEXT_PUBLIC_PROXY_URL || 'https://proxy.simplestclaw.com';

type Tab = 'general' | 'billing' | 'usage';

interface AccountData {
  user: {
    id: string;
    email: string;
    createdAt: string;
  };
  subscription: {
    plan: 'free' | 'pro';
    status: string;
    hasStripeCustomer: boolean;
    currentPeriodEnd: string | null;
  };
  licenseKey: string | null;
  usage: {
    inputTokens: number;
    outputTokens: number;
    costCents: number;
    messageCount: number;
    messagesToday: number;
    dailyLimit: number;
  };
}

// ── Icons ────────────────────────────────────────────────────────────

function UserIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
    </svg>
  );
}

function CreditCardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
    </svg>
  );
}

function ChartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  );
}

function KeyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
    </svg>
  );
}

function ExternalLinkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
    </svg>
  );
}

function LogOutIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
    </svg>
  );
}

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M12 2v4m0 12v4m-7.07-3.07l2.83-2.83m8.49-8.49l2.83-2.83M2 12h4m12 0h4m-3.07 7.07l-2.83-2.83M7.76 7.76L4.93 4.93" />
    </svg>
  );
}

// ── Sidebar Tab Button ──────────────────────────────────────────────

function TabButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[14px] font-medium transition-all ${
        active
          ? 'bg-white/[0.08] text-white'
          : 'text-white/50 hover:text-white/70 hover:bg-white/[0.03]'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

// ── General Tab ─────────────────────────────────────────────────────

function GeneralSection({ account }: { account: AccountData }) {
  const [copied, setCopied] = useState(false);

  const copyKey = () => {
    if (account.licenseKey) {
      navigator.clipboard.writeText(account.licenseKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const planLabel = account.subscription.plan === 'pro' ? 'Pro' : 'Free';
  const planBadgeColor =
    account.subscription.plan === 'pro'
      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
      : 'bg-white/5 text-white/50 border-white/10';

  return (
    <div className="space-y-8">
      {/* Account Info */}
      <div>
        <h2 className="text-[18px] font-medium mb-1">Account</h2>
        <p className="text-[14px] text-white/40 mb-5">Your simplestclaw account details.</p>

        <div className="p-5 rounded-xl bg-white/[0.02] border border-white/10 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[13px] text-white/40 mb-1">Email</p>
              <p className="text-[15px] text-white/90">{account.user.email}</p>
            </div>
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[12px] font-medium border ${planBadgeColor}`}>
              {planLabel}
            </span>
          </div>

          <div className="h-px bg-white/5" />

          <div>
            <p className="text-[13px] text-white/40 mb-1">Member since</p>
            <p className="text-[14px] text-white/70">
              {new Date(account.user.createdAt).toLocaleDateString('en-US', {
                month: 'long',
                year: 'numeric',
              })}
            </p>
          </div>

          {account.subscription.currentPeriodEnd && (
            <>
              <div className="h-px bg-white/5" />
              <div>
                <p className="text-[13px] text-white/40 mb-1">Current period ends</p>
                <p className="text-[14px] text-white/70">
                  {new Date(account.subscription.currentPeriodEnd).toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* License Key */}
      {account.licenseKey && (
        <div>
          <h2 className="text-[18px] font-medium mb-1">License Key</h2>
          <p className="text-[14px] text-white/40 mb-5">
            Use this key to activate simplestclaw on your device.
          </p>

          <div className="p-5 rounded-xl bg-white/[0.02] border border-white/10">
            <div className="flex items-center gap-3">
              <code className="flex-1 px-3 py-2.5 rounded-lg bg-white/[0.04] text-[13px] text-white/60 font-mono break-all select-all">
                {account.licenseKey}
              </code>
              <button
                type="button"
                onClick={copyKey}
                className="shrink-0 p-2.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] transition-colors text-white/50 hover:text-white/70"
                title="Copy license key"
              >
                {copied ? (
                  <CheckIcon className="w-4 h-4 text-emerald-400" />
                ) : (
                  <CopyIcon className="w-4 h-4" />
                )}
              </button>
            </div>
            <p className="text-[12px] text-white/30 mt-2.5">
              Keep this key private. You can paste it in the desktop app under Settings if needed.
            </p>
          </div>
        </div>
      )}

      {/* Download App */}
      <div>
        <h2 className="text-[18px] font-medium mb-1">Desktop App</h2>
        <p className="text-[14px] text-white/40 mb-5">
          Download simplestclaw to get started with OpenClaw.
        </p>

        <Link
          href="/"
          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-white/[0.05] border border-white/10 text-[14px] font-medium text-white/70 hover:bg-white/[0.08] hover:text-white/90 transition-all"
        >
          <ExternalLinkIcon className="w-4 h-4" />
          Download for macOS
        </Link>
      </div>
    </div>
  );
}

// ── Billing Tab ─────────────────────────────────────────────────────

function BillingSection({
  account,
  accessToken,
}: {
  account: AccountData;
  accessToken: string;
}) {
  const [upgradeLoading, setUpgradeLoading] = useState(false);

  const isPro = account.subscription.plan === 'pro';

  const handleUpgrade = async () => {
    setUpgradeLoading(true);
    try {
      const res = await fetch(`${PROXY_URL}/billing/upgrade`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      console.error('Failed to start checkout:', err);
    } finally {
      setUpgradeLoading(false);
    }
  };

  const handleManageViaToken = async () => {
    try {
      const res = await fetch(`${PROXY_URL}/billing/portal`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      console.error('Failed to open billing portal:', err);
    }
  };

  return (
    <div className="space-y-8">
      {/* Current Plan */}
      <div>
        <h2 className="text-[18px] font-medium mb-1">Plan</h2>
        <p className="text-[14px] text-white/40 mb-5">
          Manage your simplestclaw subscription.
        </p>

        <div className="rounded-xl border border-white/10 overflow-hidden">
          {/* Plan comparison */}
          <div className="grid md:grid-cols-2 divide-x divide-white/10">
            {/* Free Plan */}
            <div className={`p-6 ${!isPro ? 'bg-white/[0.03]' : 'bg-white/[0.01]'}`}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-[16px] font-medium">Free</h3>
                  <p className="text-[13px] text-white/40 mt-0.5">$0 / month</p>
                </div>
                {!isPro && (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium bg-white/10 text-white/60 border border-white/10">
                    Current plan
                  </span>
                )}
              </div>
              <ul className="space-y-2">
                {['10 messages per day', 'Claude Sonnet 4.5, GPT-5 Mini', 'Runs locally'].map((f) => (
                  <li key={f} className="flex items-start gap-2 text-[13px] text-white/50">
                    <CheckIcon className="w-3.5 h-3.5 text-white/30 shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>

            {/* Pro Plan */}
            <div className={`p-6 ${isPro ? 'bg-white/[0.03]' : 'bg-white/[0.01]'}`}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-[16px] font-medium">Pro</h3>
                  <p className="text-[13px] text-white/40 mt-0.5">$20 / month</p>
                </div>
                {isPro && (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    Current plan
                  </span>
                )}
              </div>
              <ul className="space-y-2">
                {['500 messages per day', 'All 5 models incl. Haiku 4.5, Gemini 3 Pro/Flash', 'Priority support', 'Early access to features'].map((f) => (
                  <li key={f} className="flex items-start gap-2 text-[13px] text-white/50">
                    <CheckIcon className="w-3.5 h-3.5 text-emerald-500/60 shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Action */}
          <div className="p-5 bg-white/[0.01] border-t border-white/10">
            {isPro ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[14px] text-white/70">You&apos;re on the Pro plan.</p>
                  {account.subscription.currentPeriodEnd && (
                    <p className="text-[13px] text-white/40 mt-0.5">
                      Renews {new Date(account.subscription.currentPeriodEnd).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleManageViaToken}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.05] border border-white/10 text-[13px] font-medium text-white/60 hover:bg-white/[0.08] hover:text-white/80 transition-all"
                >
                  <ExternalLinkIcon className="w-3.5 h-3.5" />
                  Manage subscription
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[14px] text-white/70">Upgrade to Pro for more messages and all models.</p>
                  <p className="text-[13px] text-white/40 mt-0.5">$20/month, cancel anytime.</p>
                </div>
                <button
                  type="button"
                  onClick={handleUpgrade}
                  disabled={upgradeLoading}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-black text-[13px] font-medium hover:bg-white/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {upgradeLoading ? (
                    <>
                      <SpinnerIcon className="w-3.5 h-3.5" />
                      Loading...
                    </>
                  ) : (
                    'Upgrade to Pro'
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Billing Portal */}
      {isPro && account.subscription.hasStripeCustomer && (
        <div>
          <h2 className="text-[18px] font-medium mb-1">Payment Method</h2>
          <p className="text-[14px] text-white/40 mb-5">
            Manage your payment details, invoices, and billing history.
          </p>

          <button
            type="button"
            onClick={handleManageViaToken}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-white/[0.05] border border-white/10 text-[14px] font-medium text-white/70 hover:bg-white/[0.08] hover:text-white/90 transition-all"
          >
            <CreditCardIcon className="w-4 h-4" />
            Open billing portal
            <ExternalLinkIcon className="w-3.5 h-3.5 ml-1" />
          </button>
          <p className="text-[12px] text-white/30 mt-2.5">
            Opens Stripe to manage your payment method, view invoices, and cancel your subscription.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Usage Tab ────────────────────────────────────────────────────────

function UsageSection({ account }: { account: AccountData }) {
  const pctUsed = Math.min(
    100,
    Math.round((account.usage.messagesToday / account.usage.dailyLimit) * 100),
  );
  const barColor = pctUsed >= 90 ? 'bg-red-500' : pctUsed >= 70 ? 'bg-amber-500' : 'bg-emerald-500';

  return (
    <div className="space-y-8">
      {/* Daily Usage */}
      <div>
        <h2 className="text-[18px] font-medium mb-1">Usage</h2>
        <p className="text-[14px] text-white/40 mb-5">Your message usage for the current period.</p>

        <div className="p-5 rounded-xl bg-white/[0.02] border border-white/10 space-y-5">
          {/* Daily messages */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[14px] text-white/70">Messages today</p>
              <p className="text-[14px] font-mono text-white/50">
                {account.usage.messagesToday} / {account.usage.dailyLimit}
              </p>
            </div>
            <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className={`h-full rounded-full ${barColor} transition-all duration-500`}
                style={{ width: `${pctUsed}%` }}
              />
            </div>
            <p className="text-[12px] text-white/30 mt-1.5">
              Resets daily at midnight UTC.
              {account.subscription.plan === 'free' && ' Upgrade to Pro for 500 messages/day.'}
            </p>
          </div>

          <div className="h-px bg-white/5" />

          {/* Monthly summary */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-[12px] text-white/30 mb-1">Messages this month</p>
              <p className="text-[20px] font-medium tabular-nums">{account.usage.messageCount.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-[12px] text-white/30 mb-1">Input tokens</p>
              <p className="text-[20px] font-medium tabular-nums">{account.usage.inputTokens.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-[12px] text-white/30 mb-1">Output tokens</p>
              <p className="text-[20px] font-medium tabular-nums">{account.usage.outputTokens.toLocaleString()}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Plan Limits */}
      <div>
        <h2 className="text-[18px] font-medium mb-1">Plan Limits</h2>
        <p className="text-[14px] text-white/40 mb-5">What&apos;s included in your current plan.</p>

        <div className="p-5 rounded-xl bg-white/[0.02] border border-white/10">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[12px] text-white/30 mb-1">Daily messages</p>
              <p className="text-[16px] font-medium">{account.usage.dailyLimit}</p>
            </div>
            <div>
              <p className="text-[12px] text-white/30 mb-1">Available models</p>
              <p className="text-[16px] font-medium">
                {account.subscription.plan === 'pro' ? 'All 5 models' : 'Sonnet 4.5, GPT-5 Mini'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────

function SettingsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState<AccountData | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('general');
  const [accessToken, setAccessToken] = useState<string>('');
  const [showUpgradeSuccess, setShowUpgradeSuccess] = useState(false);

  // Check for upgrade success
  useEffect(() => {
    if (searchParams.get('upgraded') === 'true') {
      setShowUpgradeSuccess(true);
      // Clean up URL
      const url = new URL(window.location.href);
      url.searchParams.delete('upgraded');
      window.history.replaceState({}, '', url.pathname);
    }
    // Check for tab parameter
    const tab = searchParams.get('tab');
    if (tab === 'billing' || tab === 'usage' || tab === 'general') {
      setActiveTab(tab);
    }
  }, [searchParams]);

  // Fetch account data
  const fetchAccount = useCallback(async () => {
    try {
      const { data: { session } } = await getSupabase().auth.getSession();

      if (!session) {
        // Not logged in -- redirect to login
        router.push('/auth/login?redirect=/settings');
        return;
      }

      setAccessToken(session.access_token);

      const res = await fetch(`${PROXY_URL}/billing/account`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!res.ok) {
        if (res.status === 401) {
          // Session expired
          router.push('/auth/login?redirect=/settings');
          return;
        }
        throw new Error('Failed to fetch account');
      }

      const data = await res.json();
      setAccount(data);
    } catch (err) {
      console.error('Failed to load account:', err);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchAccount();
  }, [fetchAccount]);

  const handleSignOut = async () => {
    await getSupabase().auth.signOut();
    router.push('/');
  };

  // Loading state
  if (loading) {
    return (
      <main className="min-h-screen bg-[#0a0a0a] text-[#fafafa] antialiased flex items-center justify-center">
        <div className="flex items-center gap-3 text-white/40">
          <SpinnerIcon className="w-5 h-5" />
          <span className="text-[15px]">Loading your account...</span>
        </div>
      </main>
    );
  }

  // No account data
  if (!account) {
    return (
      <main className="min-h-screen bg-[#0a0a0a] text-[#fafafa] antialiased flex items-center justify-center p-6">
        <div className="text-center">
          <h1 className="text-[24px] font-medium mb-3">Something went wrong</h1>
          <p className="text-[15px] text-white/50 mb-6">We couldn&apos;t load your account. Please try signing in again.</p>
          <Link
            href="/auth/login?redirect=/settings"
            className="inline-block px-5 py-3 rounded-xl bg-white text-black text-[14px] font-medium hover:bg-white/90 transition-colors"
          >
            Sign in
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-[#fafafa] antialiased">
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0a0a0a]/80 backdrop-blur-md border-b border-white/5">
        <div className="max-w-[1400px] mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-1">
            <img src="/logo.png" alt="SimplestClaw" className="w-5 h-5 mt-0.5" />
            <span className="text-[15px] font-medium tracking-tight">simplestclaw</span>
          </Link>
          <div className="flex items-center gap-6">
            <Link
              href="/pricing"
              className="text-[13px] text-white/60 hover:text-white/80 transition-colors"
            >
              Pricing
            </Link>
            <Link
              href="/settings"
              className="text-[13px] text-white/80 transition-colors"
            >
              Settings
            </Link>
            <a
              href="https://github.com/mbron64/simplestclaw"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[13px] text-white/60 hover:text-white/80 transition-colors"
            >
              GitHub
            </a>
          </div>
        </div>
      </nav>

      {/* Upgrade success banner */}
      {showUpgradeSuccess && (
        <div className="fixed top-14 left-0 right-0 z-40 bg-emerald-500/10 border-b border-emerald-500/20">
          <div className="max-w-[1400px] mx-auto px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckIcon className="w-5 h-5 text-emerald-400" />
              <p className="text-[14px] text-emerald-300">
                Welcome to Pro! Your upgrade is active.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowUpgradeSuccess(false)}
              className="text-[13px] text-emerald-400/60 hover:text-emerald-400 transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      <div className={`max-w-4xl mx-auto px-6 ${showUpgradeSuccess ? 'pt-28' : 'pt-24'} pb-24`}>
        <div className="mb-8">
          <h1 className="text-[28px] font-medium tracking-[-0.02em]">Settings</h1>
          <p className="text-[15px] text-white/40 mt-1">
            Manage your account, subscription, and usage.
          </p>
        </div>

        <div className="flex gap-8">
          {/* Sidebar */}
          <div className="w-48 shrink-0">
            <div className="sticky top-24 space-y-1">
              <TabButton
                active={activeTab === 'general'}
                icon={<UserIcon className="w-4 h-4" />}
                label="General"
                onClick={() => setActiveTab('general')}
              />
              <TabButton
                active={activeTab === 'billing'}
                icon={<CreditCardIcon className="w-4 h-4" />}
                label="Billing"
                onClick={() => setActiveTab('billing')}
              />
              <TabButton
                active={activeTab === 'usage'}
                icon={<ChartIcon className="w-4 h-4" />}
                label="Usage"
                onClick={() => setActiveTab('usage')}
              />

              <div className="h-px bg-white/5 my-3" />

              <button
                type="button"
                onClick={handleSignOut}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[14px] font-medium text-white/40 hover:text-red-400 hover:bg-red-500/5 transition-all"
              >
                <LogOutIcon className="w-4 h-4" />
                Sign out
              </button>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 min-w-0">
            {activeTab === 'general' && <GeneralSection account={account} />}
            {activeTab === 'billing' && (
              <BillingSection account={account} accessToken={accessToken} />
            )}
            {activeTab === 'usage' && <UsageSection account={account} />}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-white/5">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between text-[13px] text-white/30">
          <span>MIT License</span>
          <div className="flex items-center gap-6">
            <Link href="/" className="hover:text-white/60 transition-colors">
              Home
            </Link>
            <a href="https://openclaw.ai" className="hover:text-white/60 transition-colors">
              OpenClaw
            </a>
            <a
              href="https://github.com/mbron64/simplestclaw"
              className="hover:text-white/60 transition-colors"
            >
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#0a0a0a] text-[#fafafa] antialiased flex items-center justify-center">
          <div className="flex items-center gap-3 text-white/40">
            <SpinnerIcon className="w-5 h-5" />
            <span className="text-[15px]">Loading...</span>
          </div>
        </main>
      }
    >
      <SettingsPageContent />
    </Suspense>
  );
}
