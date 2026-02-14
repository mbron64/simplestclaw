'use client';

import { AuthNavLink } from '@/components/AuthNavLink';
import { GlowingEffect } from '@/components/ui/glowing-effect';
import Link from 'next/link';
import { useState } from 'react';

const PLANS = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    description: 'Get started with OpenClaw for free.',
    features: [
      '10 messages per day',
      'Claude Sonnet 4.5, GPT-5 Mini',
      'Runs locally on your machine',
      'No account data stored on our servers',
    ],
    cta: 'Download free',
    ctaLink: '/',
    highlighted: false,
  },
  {
    name: 'Pro',
    price: '$20',
    period: '/month',
    description: 'For power users who need more capacity and top-tier models.',
    features: [
      '500 messages per day',
      'All models: Claude Sonnet 4.5, Haiku 4.5, GPT-5 Mini, Gemini 3 Pro, Gemini 3 Flash',
      'Priority support',
      'Early access to new features',
      'No account data stored on our servers',
    ],
    cta: 'Start free, upgrade anytime',
    ctaLink: '/settings?tab=billing',
    highlighted: true,
  },
];

function CheckIcon() {
  return (
    <svg
      className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function PlanCard({
  plan,
}: {
  plan: (typeof PLANS)[number];
}) {
  return (
    <div
      className={`relative p-8 rounded-2xl border transition-all flex flex-col ${
        plan.highlighted
          ? 'bg-white/[0.04] border-emerald-500/20'
          : 'bg-white/[0.02] border-white/10'
      }`}
    >
      {plan.highlighted && (
        <GlowingEffect
          spread={40}
          glow={true}
          disabled={false}
          proximity={64}
          inactiveZone={0.01}
          borderWidth={2}
        />
      )}

      {plan.highlighted && (
        <span className="absolute -top-3 left-8 inline-block text-[12px] font-medium px-3 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/20">
          Most popular
        </span>
      )}

      <div className="mb-6">
        <h3 className="text-[20px] font-medium mb-1">{plan.name}</h3>
        <div className="flex items-baseline gap-1">
          <span className="text-[36px] font-medium tracking-tight">{plan.price}</span>
          <span className="text-[15px] text-white/40">{plan.period}</span>
        </div>
        <p className="text-[14px] text-white/50 mt-2">{plan.description}</p>
      </div>

      <ul className="space-y-3 mb-8">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2.5 text-[14px] text-white/70">
            <CheckIcon />
            {feature}
          </li>
        ))}
      </ul>

      <Link
        href={plan.ctaLink}
        className={`mt-auto block w-full text-center py-3 rounded-xl text-[15px] font-medium transition-all ${
          plan.highlighted
            ? 'bg-white text-black hover:bg-white/90'
            : 'bg-white/5 text-white/70 hover:bg-white/10 border border-white/10'
        }`}
      >
        {plan.cta}
      </Link>
    </div>
  );
}

function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const questions = [
    {
      q: 'How does the free plan work?',
      a: 'When you download simplestclaw, you can sign up with just an email. You get 10 AI messages per day at no cost. No credit card required.',
    },
    {
      q: 'What models are available?',
      a: 'Free users have access to Claude Sonnet 4.5 and GPT-5 Mini. Pro users get access to all 5 models including Claude Haiku 4.5, Gemini 3 Pro, and Gemini 3 Flash.',
    },
    {
      q: 'Can I switch between managed and BYO mode?',
      a: 'Yes! You can switch anytime in Settings. If you have your own API key, you can use it directly with no limits from us. You can also use our managed service for convenience.',
    },
    {
      q: 'Is my data private?',
      a: 'simplestclaw runs on your machine and we never store your conversations. In managed mode, messages are routed through our proxy to the AI provider (Anthropic, OpenAI, etc.) but are not stored. In BYO mode, the connection is direct between you and the provider.',
    },
    {
      q: 'How do I cancel?',
      a: 'You can cancel your Pro subscription anytime from Settings in the app. You\'ll keep access until the end of your billing period.',
    },
  ];

  return (
    <section className="py-24 px-6 border-t border-white/5">
      <div className="max-w-2xl mx-auto">
        <h2 className="text-[32px] font-medium tracking-[-0.02em] mb-12 text-center">
          Frequently asked questions
        </h2>

        <div className="space-y-2">
          {questions.map((item, index) => (
            <div
              key={item.q}
              className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden"
            >
              <button
                type="button"
                onClick={() => setOpenIndex(openIndex === index ? null : index)}
                className="w-full px-5 py-4 text-left flex items-center justify-between"
              >
                <span className="text-[15px] text-white/80 font-medium">{item.q}</span>
                <svg
                  className={`w-4 h-4 text-white/40 transition-transform ${openIndex === index ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {openIndex === index && (
                <div className="px-5 pb-4">
                  <p className="text-[14px] text-white/50 leading-relaxed">{item.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function PricingPage() {
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
            <AuthNavLink className="text-[13px] text-white/60 hover:text-white/80 transition-colors" />
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

      {/* Hero */}
      <section className="pt-32 pb-16 px-6">
        <div className="max-w-[1400px] mx-auto text-center">
          <h1 className="text-[48px] sm:text-[56px] font-medium tracking-[-0.03em] leading-[1.1]">
            Simple, transparent pricing
          </h1>
          <p className="mt-4 text-[17px] text-white/50 max-w-lg mx-auto">
            Start free. Upgrade when you need more. Or bring your own API key.
          </p>
        </div>
      </section>

      {/* Plan Cards */}
      <section className="pb-24 px-6">
        <div className="max-w-3xl mx-auto grid md:grid-cols-2 gap-4">
          {PLANS.map((plan) => (
            <PlanCard key={plan.name} plan={plan} />
          ))}
        </div>
        <p className="text-[13px] text-white/30 text-center mt-6">
          You can also bring your own API key and use the app with no limits from us.
        </p>
      </section>

      <FAQ />

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
