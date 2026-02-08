'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { GlowingEffect } from '@/components/ui/glowing-effect';
import { CyclingText } from '@/components/ui/cycling-text';

type DeploymentMode = 'local' | 'hosted' | null;
type Provider = 'anthropic' | 'openai' | 'google' | 'openrouter' | null;

const PROVIDER_TEMPLATES: Record<Exclude<Provider, null>, string> = {
  anthropic: 'https://railway.com/new/template/simplestclaw-anthropic',
  openai: 'https://railway.com/new/template/simplestclaw-openai',
  google: 'https://railway.com/new/template/simplestclaw-gemini',
  openrouter: 'https://railway.com/new/template/simplestclaw-openrouter',
};

// GitHub release download URLs
const GITHUB_REPO = 'mbron64/simplestclaw';
const APP_VERSION = '0.1.0';

const getDownloadUrl = (platform: 'macos' | 'windows' | 'linux') => {
  const baseUrl = `https://github.com/${GITHUB_REPO}/releases/latest/download`;
  switch (platform) {
    case 'macos':
      return `${baseUrl}/simplestclaw_${APP_VERSION}_universal.dmg`;
    case 'windows':
      return `${baseUrl}/simplestclaw_${APP_VERSION}_x64-setup.exe`;
    case 'linux':
      return `${baseUrl}/simplestclaw_${APP_VERSION}_amd64.deb`;
  }
};

export default function Home() {
  const [mode, setMode] = useState<DeploymentMode>(null);
  const [gatewayUrl, setGatewayUrl] = useState('');
  const [timeCount, setTimeCount] = useState(60);
  const [showFinal, setShowFinal] = useState(false);
  const [started, setStarted] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<Provider>(null);

  useEffect(() => {
    const startTimer = setTimeout(() => setStarted(true), 800);
    return () => clearTimeout(startTimer);
  }, []);

  useEffect(() => {
    if (!started) return;
    if (timeCount > 1) {
      const timer = setTimeout(() => setTimeCount(timeCount - 1), 18);
      return () => clearTimeout(timer);
    } else if (timeCount === 1 && !showFinal) {
      setShowFinal(true);
    }
  }, [timeCount, showFinal, started]);

  const timerColor = showFinal 
    ? '#10b981' 
    : `rgb(${Math.round(239 - (60 - timeCount) * 2.8)}, ${Math.round(68 + (60 - timeCount) * 2.5)}, ${Math.round(68 - (60 - timeCount) * 0.5)})`;

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-[#fafafa] antialiased">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0a0a0a]/80 backdrop-blur-md border-b border-white/5">
        <div className="max-w-[1400px] mx-auto px-6 h-14 flex items-center justify-between">
          <span className="text-[15px] font-medium tracking-tight">simplestclaw</span>
          <a 
            href="https://github.com/mbron64/simplestclaw" 
            className="text-[13px] text-white/50 hover:text-white/90 transition-colors flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
            Star on GitHub
          </a>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-[1400px] mx-auto">
          <div className="text-center">
            <h1 className="text-[56px] sm:text-[72px] font-medium tracking-[-0.04em] leading-[1.05]">
              Deploy OpenClaw with{' '}
              <span className="text-emerald-400">0</span>{' '}
              <CyclingText 
                words={['stress', 'config', 'servers', 'headaches']} 
                className="text-emerald-400"
                interval={2000}
              />
            </h1>
            <p className="mt-6 text-[19px] text-white/50 leading-relaxed max-w-xl mx-auto">
              The easiest way to run OpenClaw. No terminal, no Telegram bots, no server configuration.
            </p>
          </div>

          {/* Options */}
          {!mode && (
            <>
            <div className="mt-16 grid lg:grid-cols-2 gap-4 max-w-4xl mx-auto">
              <button
                onClick={() => setMode('local')}
                className="group relative text-left p-8 rounded-2xl bg-white/[0.02] border border-white/10 hover:bg-white/[0.04] hover:border-white/20 transition-all"
              >
                <GlowingEffect
                  spread={40}
                  glow={true}
                  disabled={false}
                  proximity={64}
                  inactiveZone={0.01}
                  borderWidth={2}
                />
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-[22px] font-medium">Run locally</h2>
                  <svg className="w-5 h-5 text-white/30 group-hover:text-white/60 group-hover:translate-x-1 transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12h15m0 0l-6.75-6.75M19.5 12l-6.75 6.75" />
                  </svg>
                </div>
                <p className="text-[15px] text-white/50 leading-relaxed mb-4">
                  Download the open source desktop app. Everything runs on your machine. Your data never leaves.
                </p>
                <span className="inline-block text-[13px] font-medium px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400">
                  Free
                </span>
                <div className="mt-6 pt-6 border-t border-white/5 flex items-center gap-4 text-[13px] text-white/40">
                  <span>macOS</span>
                  <span className="w-1 h-1 rounded-full bg-white/20" />
                  <span>Windows</span>
                  <span className="w-1 h-1 rounded-full bg-white/20" />
                  <span>Linux</span>
                </div>
              </button>

              <button
                onClick={() => setMode('hosted')}
                className="group relative text-left p-8 rounded-2xl bg-white/[0.02] border border-white/10 hover:bg-white/[0.04] hover:border-white/20 transition-all"
              >
                <GlowingEffect
                  spread={40}
                  glow={true}
                  disabled={false}
                  proximity={64}
                  inactiveZone={0.01}
                  borderWidth={2}
                />
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-[22px] font-medium">Run in the cloud</h2>
                  <svg className="w-5 h-5 text-white/30 group-hover:text-white/60 group-hover:translate-x-1 transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12h15m0 0l-6.75-6.75M19.5 12l-6.75 6.75" />
                  </svg>
                </div>
                <p className="text-[15px] text-white/50 leading-relaxed mb-4">
                  Enter API key, click deploy, done. Runs 24/7, accessible from any device.
                </p>
                <span className="inline-block text-[13px] font-medium px-2.5 py-1 rounded-full bg-white/5 text-white/60">
                  $5/month via Railway
                </span>
                <div className="mt-6 pt-6 border-t border-white/5 flex items-center gap-4 text-[13px] text-white/40">
                  <span>24/7 uptime</span>
                  <span className="w-1 h-1 rounded-full bg-white/20" />
                  <span>Any device</span>
                  <span className="w-1 h-1 rounded-full bg-white/20" />
                  <span>60s deploy</span>
                </div>
              </button>
            </div>

            <div className="mt-20 flex items-center justify-center gap-3 text-[13px] text-white/30">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
              <span>Open source</span>
              <span className="w-1 h-1 rounded-full bg-white/20" />
              <span>MIT License</span>
            </div>
            </>
          )}

          {/* Local Flow */}
          {mode === 'local' && (
            <div className="mt-16">
              <button
                onClick={() => setMode(null)}
                className="text-[13px] text-white/40 hover:text-white/70 transition-colors mb-8 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15m0 0l6.75 6.75M4.5 12l6.75-6.75" />
                </svg>
                Back
              </button>
              
              <div className="max-w-2xl mx-auto">
                <h2 className="text-[28px] font-medium mb-2 text-center">Download for your platform</h2>
              <p className="text-[15px] text-white/50 mb-8 text-center">
                OpenClaw pre-configured and ready to run.
              </p>

              <div className="grid grid-cols-3 gap-3">
                {[
                  { name: 'macOS', sub: 'Universal', platform: 'macos' as const },
                  { name: 'Windows', sub: '10+', platform: 'windows' as const },
                  { name: 'Linux', sub: '.deb', platform: 'linux' as const },
                ].map((p) => (
                  <a
                    key={p.name}
                    href={getDownloadUrl(p.platform)}
                    download
                    className="relative p-6 rounded-xl bg-white/[0.02] border border-white/10 hover:bg-white/[0.04] hover:border-white/20 transition-all text-center"
                  >
                    <GlowingEffect
                      spread={40}
                      glow={true}
                      disabled={false}
                      proximity={64}
                      inactiveZone={0.01}
                      borderWidth={2}
                    />
                    <div className="text-[17px] font-medium">{p.name}</div>
                    <div className="text-[13px] text-white/40 mt-1">{p.sub}</div>
                  </a>
                ))}
              </div>

              <div className="mt-8 p-5 rounded-xl bg-white/[0.02] border border-white/5">
                <p className="text-[13px] text-white/40 mb-1">What's included:</p>
                <p className="text-[13px] text-emerald-400 mb-4">100% private. Your data never leaves your computer.</p>
                <ul className="space-y-3 text-[14px]">
                  <li className="flex items-start gap-2">
                    <span className="text-white/30 mt-0.5">•</span>
                    <div>
                      <span className="text-white/70">Easy-to-use interface</span>
                      <span className="text-white/40"> Chat, see tool actions, and code execution in one place.</span>
                    </div>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-white/30 mt-0.5">•</span>
                    <div>
                      <span className="text-white/70">OpenClaw bundled and ready</span>
                      <span className="text-white/40"> Just open the app and start using OpenClaw.</span>
                    </div>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-white/30 mt-0.5">•</span>
                    <div>
                      <span className="text-white/70">Runs entirely on your machine</span>
                      <span className="text-white/40"> No data sent to external servers.</span>
                    </div>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-white/30 mt-0.5">•</span>
                    <div>
                      <span className="text-white/70">Works offline</span>
                      <span className="text-white/40"> Once set up, no internet required.</span>
                    </div>
                  </li>
                </ul>
              </div>

              <div className="mt-8 pt-8 border-t border-white/5">
                <p className="text-[13px] text-white/40 mb-4 text-center">Already running OpenClaw?</p>
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={gatewayUrl}
                    onChange={(e) => setGatewayUrl(e.target.value)}
                    placeholder="ws://localhost:18789"
                    className="flex-1 px-4 py-3 rounded-xl bg-white/[0.02] border border-white/10 text-[15px] placeholder-white/30 focus:outline-none focus:border-white/20 font-mono transition-colors"
                  />
                  <Link
                    href={gatewayUrl ? `/chat?gateway=${encodeURIComponent(gatewayUrl)}` : '#'}
                    className={`relative px-6 py-3 rounded-xl text-[15px] font-medium transition-all ${
                      gatewayUrl
                        ? 'bg-white text-black hover:bg-white/90'
                        : 'bg-white/5 text-white/30 cursor-not-allowed'
                    }`}
                  >
                    <GlowingEffect
                      spread={40}
                      glow={true}
                      disabled={false}
                      proximity={64}
                      inactiveZone={0.01}
                      borderWidth={2}
                    />
                    Connect
                  </Link>
                </div>
              </div>
              </div>
            </div>
          )}

          {/* Cloud Flow */}
          {mode === 'hosted' && (
            <div className="mt-16">
              <button
                onClick={() => setMode(null)}
                className="text-[13px] text-white/40 hover:text-white/70 transition-colors mb-8 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15m0 0l6.75 6.75M4.5 12l6.75-6.75" />
                </svg>
                Back
              </button>

              <div className="max-w-2xl mx-auto">
                <h2 className="text-[28px] font-medium mb-6 text-center">Deploy to the cloud</h2>

              <div className="p-5 rounded-xl bg-white/[0.02] border border-white/10">
                {/* Step 1: Choose Provider */}
                <div className="mb-6">
                  <p className="text-[13px] text-white/40 mb-3">Step 1: Choose your AI provider</p>
                  <div className="grid grid-cols-4 gap-2">
                    {/* Anthropic */}
                    <button
                      onClick={() => setSelectedProvider('anthropic')}
                      className={`px-3 py-2.5 rounded-lg border transition-all flex items-center gap-2 ${
                        selectedProvider === 'anthropic'
                          ? 'bg-white/10 border-white/30'
                          : 'bg-white/[0.02] border-white/10 hover:bg-white/[0.05] hover:border-white/20'
                      }`}
                    >
                      <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="#D4A27F">
                        <path d="M17.304 3.541h-3.672l6.696 16.918H24Zm-10.608 0L0 20.459h3.744l1.37-3.553h7.005l1.369 3.553h3.744L10.536 3.541Zm-.371 10.223L8.616 7.82l2.291 5.945Z"/>
                      </svg>
                      <span className="text-[13px] text-white/70">Anthropic</span>
                    </button>
                    
                    {/* OpenAI */}
                    <button
                      onClick={() => setSelectedProvider('openai')}
                      className={`px-3 py-2.5 rounded-lg border transition-all flex items-center gap-2 ${
                        selectedProvider === 'openai'
                          ? 'bg-white/10 border-white/30'
                          : 'bg-white/[0.02] border-white/10 hover:bg-white/[0.05] hover:border-white/20'
                      }`}
                    >
                      <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="white">
                        <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/>
                      </svg>
                      <span className="text-[13px] text-white/70">OpenAI</span>
                    </button>
                    
                    {/* Gemini */}
                    <button
                      onClick={() => setSelectedProvider('google')}
                      className={`px-3 py-2.5 rounded-lg border transition-all flex items-center gap-2 ${
                        selectedProvider === 'google'
                          ? 'bg-white/10 border-white/30'
                          : 'bg-white/[0.02] border-white/10 hover:bg-white/[0.05] hover:border-white/20'
                      }`}
                    >
                      <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M12 2L9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5z"/>
                        <path fill="#34A853" d="M12 2L9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5z" opacity="0.6"/>
                      </svg>
                      <span className="text-[13px] text-white/70">Gemini</span>
                    </button>
                    
                    {/* OpenRouter */}
                    <button
                      onClick={() => setSelectedProvider('openrouter')}
                      className={`px-3 py-2.5 rounded-lg border transition-all flex items-center gap-2 ${
                        selectedProvider === 'openrouter'
                          ? 'bg-white/10 border-white/30'
                          : 'bg-white/[0.02] border-white/10 hover:bg-white/[0.05] hover:border-white/20'
                      }`}
                    >
                      <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="#6366F1">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                      </svg>
                      <span className="text-[13px] text-white/70">OpenRouter</span>
                    </button>
                  </div>
                </div>

                {/* Step 2: Deploy Button */}
                <div>
                  <p className="text-[13px] text-white/40 mb-3">Step 2: Deploy to Railway</p>
                  <a
                    href={selectedProvider ? PROVIDER_TEMPLATES[selectedProvider] : '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => !selectedProvider && e.preventDefault()}
                    className={`relative flex items-center justify-center gap-2 w-full p-4 rounded-xl text-[15px] font-medium transition-all ${
                      selectedProvider
                        ? 'bg-white text-black hover:bg-white/90 cursor-pointer'
                        : 'bg-white/10 text-white/30 cursor-not-allowed'
                    }`}
                  >
                    {selectedProvider && (
                      <GlowingEffect
                        spread={40}
                        glow={true}
                        disabled={false}
                        proximity={64}
                        inactiveZone={0.01}
                        borderWidth={2}
                      />
                    )}
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                    </svg>
                    Continue to deploy
                  </a>
                </div>
              </div>
              <p className="text-[12px] text-white/30 mt-3 text-center">
                {selectedProvider 
                  ? `You'll enter your ${selectedProvider === 'google' ? 'Gemini' : selectedProvider === 'openai' ? 'OpenAI' : selectedProvider === 'anthropic' ? 'Anthropic' : 'OpenRouter'} API key on Railway.`
                  : 'Select a provider to continue.'}
              </p>

              <div className="mt-8 p-5 rounded-xl bg-white/[0.02] border border-white/5">
                <p className="text-[13px] text-white/40 mb-1">What happens next:</p>
                <ol className="space-y-2 text-[14px] mb-6">
                  <li className="flex items-start gap-3">
                    <span className="text-emerald-400 font-medium">1.</span>
                    <span className="text-white/70">Continue to Railway</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-emerald-400 font-medium">2.</span>
                    <span className="text-white/70">Follow the steps</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-emerald-400 font-medium">3.</span>
                    <span className="text-white/70">Use OpenClaw in the cloud</span>
                  </li>
                </ol>
                <p className="text-[13px] text-white/40 mb-1 pt-4 border-t border-white/5">What you get:</p>
                <ul className="space-y-3 text-[14px] mt-3">
                  <li className="flex items-start gap-2">
                    <span className="text-white/30 mt-0.5">•</span>
                    <div>
                      <span className="text-white/70">OpenClaw pre-configured</span>
                      <span className="text-white/40"> Ready to use the moment you deploy.</span>
                    </div>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-white/30 mt-0.5">•</span>
                    <div>
                      <span className="text-white/70">Always online</span>
                      <span className="text-white/40"> OpenClaw stays available 24/7.</span>
                    </div>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-white/30 mt-0.5">•</span>
                    <div>
                      <span className="text-white/70">Access from anywhere</span>
                      <span className="text-white/40"> Phone, laptop, tablet, any device.</span>
                    </div>
                  </li>
                </ul>
                <p className="text-[12px] text-white/30 mt-4 pt-4 border-t border-white/5">
<span className="text-red-400">Note*</span> Requires Railway Hobby plan ($5/month). Free trial has memory limits.
                </p>
              </div>

              <div className="mt-12 pt-8 border-t border-white/5">
                <p className="text-[13px] text-white/40 mb-4 text-center">Already deployed?</p>
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={gatewayUrl}
                    onChange={(e) => setGatewayUrl(e.target.value)}
                    placeholder="wss://your-app.railway.app"
                    className="flex-1 px-4 py-3 rounded-xl bg-white/[0.02] border border-white/10 text-[15px] placeholder-white/30 focus:outline-none focus:border-white/20 font-mono transition-colors"
                  />
                  <Link
                    href={gatewayUrl ? `/chat?gateway=${encodeURIComponent(gatewayUrl)}` : '#'}
                    className={`relative px-6 py-3 rounded-xl text-[15px] font-medium transition-all ${
                      gatewayUrl
                        ? 'bg-white text-black hover:bg-white/90'
                        : 'bg-white/5 text-white/30 cursor-not-allowed'
                    }`}
                  >
                    <GlowingEffect
                      spread={40}
                      glow={true}
                      disabled={false}
                      proximity={64}
                      inactiveZone={0.01}
                      borderWidth={2}
                    />
                    Connect
                  </Link>
                </div>
              </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-32 px-6 border-t border-white/5">
        <div className="max-w-[1400px] mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-[40px] font-medium tracking-[-0.02em] mb-4">What is OpenClaw?</h2>
            <p className="text-[17px] text-white/50 max-w-xl mx-auto">
              OpenClaw is an open-source AI that runs continuously, integrates with your tools, and maintains context across conversations.
            </p>
          </div>
          
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-white/5 rounded-2xl overflow-hidden">
            {[
              { title: 'Persistent memory', desc: 'Maintains context across all conversations and sessions.' },
              { title: 'Tool integrations', desc: 'Calendar, email, files, code execution, web search.' },
              { title: 'Privacy-first', desc: 'Data stays on your infrastructure. No third-party access.' },
              { title: 'Always available', desc: 'Runs in background, ready when you need it.' },
            ].map((item) => (
              <div key={item.title} className="p-8 bg-[#0a0a0a]">
                <h3 className="text-[17px] font-medium mb-2">{item.title}</h3>
                <p className="text-[15px] text-white/40 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison */}
      <section id="compare" className="py-32 px-6 border-t border-white/5">
        <div className="max-w-[1400px] mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-[40px] font-medium tracking-[-0.02em] mb-4">Why simplestclaw?</h2>
            <p className="text-[17px] text-white/50 max-w-xl mx-auto">
              Traditional OpenClaw setup requires technical knowledge and takes about an hour. We reduced it to one click.
            </p>
          </div>
          
          <div className="grid lg:grid-cols-2 gap-6 max-w-4xl mx-auto">
            <div className="p-8 rounded-2xl bg-white/[0.02] border border-white/5">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-[19px] font-medium text-white/60">Traditional setup</h3>
                <a 
                  href="https://docs.clawd.bot/cli/setup" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-[13px] text-white/30 hover:text-white/50 transition-colors"
                >
                  ~60 minutes →
                </a>
              </div>
              <ol className="space-y-4">
                {[
                  { step: 'Provision a virtual machine', sub: 'DigitalOcean, AWS, or similar. Need a credit card.' },
                  { step: 'Configure SSH access', sub: 'Generate keys, add to server, test connection.' },
                  { step: 'Install Node.js runtime', sub: 'Hope your package manager cooperates.' },
                  { step: 'Clone and configure OpenClaw', sub: 'Environment variables, permissions, dependencies.' },
                  { step: 'Set up Telegram bot via BotFather', sub: 'Create bot, get tokens, configure webhooks.' },
                  { step: 'Configure process manager', sub: 'PM2 or systemd to keep it running.' },
                  { step: 'Debug deployment issues', sub: 'Something always breaks.' },
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-4">
                    <span className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center text-[12px] text-white/30 shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <div>
                      <span className="text-[15px] text-white/50">{item.step}</span>
                      <p className="text-[13px] text-white/25 mt-0.5">{item.sub}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            <div className="p-8 rounded-2xl bg-emerald-500/[0.03] border border-emerald-500/10">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-[19px] font-medium">With simplestclaw</h3>
                <span className="text-[13px] text-emerald-400">&lt;1 minute</span>
              </div>
              <ol className="space-y-4">
                {[
                  { step: 'Choose local or cloud', sub: 'Based on what works for you.' },
                  { step: 'Click download or deploy', sub: 'One button. That\'s it.' },
                  { step: 'Done', sub: 'Start using OpenClaw.' },
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-4">
                    <span className="w-6 h-6 rounded-full bg-emerald-500/10 flex items-center justify-center text-[12px] text-emerald-400 shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <div>
                      <span className="text-[15px] text-white/70">{item.step}</span>
                      <p className="text-[13px] text-white/40 mt-0.5">{item.sub}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="mt-8 pt-6 border-t border-emerald-500/10">
                <p className="text-[15px] text-white/50">No terminal. No Telegram. No DevOps.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-white/5">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between text-[13px] text-white/30">
          <span>MIT License</span>
          <div className="flex items-center gap-6">
            <a href="https://openclaw.ai" className="hover:text-white/60 transition-colors">
              OpenClaw
            </a>
            <a href="https://github.com/mbron64/simplestclaw" className="hover:text-white/60 transition-colors">
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}
