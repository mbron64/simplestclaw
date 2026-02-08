import { AlertCircle, Check, Download, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAppStore } from '../lib/store';
import { type RuntimeStatus as TauriRuntimeStatus, tauri } from '../lib/tauri';

type Provider = 'anthropic' | 'openai' | 'google' | 'openrouter' | null;

const PROVIDER_INFO: Record<
  Exclude<Provider, null>,
  { name: string; placeholder: string; url: string }
> = {
  anthropic: {
    name: 'Anthropic',
    placeholder: 'sk-ant-api03-...',
    url: 'https://console.anthropic.com/settings/keys',
  },
  openai: {
    name: 'OpenAI',
    placeholder: 'sk-...',
    url: 'https://platform.openai.com/api-keys',
  },
  google: {
    name: 'Gemini',
    placeholder: 'AIza...',
    url: 'https://aistudio.google.com/app/apikey',
  },
  openrouter: {
    name: 'OpenRouter',
    placeholder: 'sk-or-...',
    url: 'https://openrouter.ai/keys',
  },
};

// Provider Icons
const providerIcons = {
  anthropic: (
    <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="#D4A27F" aria-hidden="true">
      <path d="M17.304 3.541h-3.672l6.696 16.918H24Zm-10.608 0L0 20.459h3.744l1.37-3.553h7.005l1.369 3.553h3.744L10.536 3.541Zm-.371 10.223L8.616 7.82l2.291 5.945Z" />
    </svg>
  ),
  openai: (
    <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="white" aria-hidden="true">
      <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" />
    </svg>
  ),
  google: (
    <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M12 2L9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5z" />
      <path
        fill="#34A853"
        d="M12 2L9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5z"
        opacity="0.6"
      />
    </svg>
  ),
  openrouter: (
    <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="#6366F1" aria-hidden="true">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
    </svg>
  ),
};

// Provider Button Component
function ProviderButton({
  provider,
  label,
  selected,
  disabled,
  onSelect,
}: {
  provider: Exclude<Provider, null>;
  label: string;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={`px-4 py-3 rounded-xl border transition-all flex items-center gap-3 ${
        selected
          ? 'bg-white/10 border-white/30'
          : 'bg-white/[0.02] border-white/10 hover:bg-white/[0.05] hover:border-white/20'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      {providerIcons[provider]}
      <span className="text-[14px] text-white/80">{label}</span>
    </button>
  );
}

// Runtime Status Component
function RuntimeStatusDisplay({
  runtimeStatus,
  onRetry,
}: {
  runtimeStatus: ReturnType<typeof useAppStore>['runtimeStatus'];
  onRetry: () => void;
}) {
  if (runtimeStatus.type === 'downloading') {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Download className="w-5 h-5 text-blue-400 animate-pulse" />
          <div className="flex-1">
            <p className="text-[15px] text-white/70">Setting up...</p>
            <p className="text-[13px] text-white/40">
              Downloading runtime ({Math.round(runtimeStatus.progress)}%)
            </p>
          </div>
        </div>
        <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-300"
            style={{ width: `${runtimeStatus.progress}%` }}
          />
        </div>
      </div>
    );
  }

  if (runtimeStatus.type === 'error') {
    return (
      <div className="flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-red-400 mt-0.5" />
        <div className="flex-1">
          <p className="text-[15px] text-white/70">Setup failed</p>
          <p className="text-[13px] text-white/40 mb-3">{runtimeStatus.message}</p>
          <button
            type="button"
            onClick={onRetry}
            className="text-[13px] text-blue-400 hover:text-blue-300 transition-colors"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <Loader2 className="w-5 h-5 text-white/40 animate-spin" />
      <p className="text-[15px] text-white/50">Checking system...</p>
    </div>
  );
}

// Continue Button Component
function ContinueButton({
  apiKey,
  selectedProvider,
  saving,
  runtimeReady,
  onClick,
}: {
  apiKey: string;
  selectedProvider: Provider;
  saving: boolean;
  runtimeReady: boolean;
  onClick: () => void;
}) {
  const canContinue = apiKey.trim() && selectedProvider && !saving && runtimeReady;

  const getButtonText = () => {
    if (saving) return null;
    if (!runtimeReady) return 'Waiting for setup...';
    if (!selectedProvider) return 'Select a provider';
    if (!apiKey.trim()) return 'Enter your API key';
    return 'Continue';
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!canContinue}
      className={`w-full py-3 rounded-xl text-[15px] font-medium transition-all flex items-center justify-center gap-2 ${
        canContinue
          ? 'bg-white text-black hover:bg-white/90'
          : 'bg-white/5 text-white/30 cursor-not-allowed'
      }`}
    >
      {saving ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          Starting...
        </>
      ) : (
        getButtonText()
      )}
    </button>
  );
}

// Main Onboarding Component
export function Onboarding() {
  const {
    error,
    runtimeStatus,
    setScreen,
    setGatewayStatus,
    setApiKeyConfigured,
    setError,
    setRuntimeStatus,
  } = useAppStore();
  const [selectedProvider, setSelectedProvider] = useState<Provider>(null);
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [runtimeDetails, setRuntimeDetails] = useState<TauriRuntimeStatus | null>(null);

  useEffect(() => {
    const fetchRuntime = async () => {
      try {
        const status = await tauri.getRuntimeStatus();
        setRuntimeDetails(status);
      } catch (err) {
        console.error('Failed to get runtime status:', err);
      }
    };
    fetchRuntime();
    const interval = setInterval(fetchRuntime, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleInstallRuntime = async () => {
    setRuntimeStatus({ type: 'downloading', progress: 0 });
    try {
      await tauri.installRuntime();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setRuntimeStatus({ type: 'error', message });
    }
  };

  const handleSave = async () => {
    if (!apiKey.trim() || !selectedProvider) return;

    if (runtimeStatus.type !== 'installed') {
      setError('Please wait for the runtime to finish installing.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await tauri.setApiKey(apiKey.trim());
      setApiKeyConfigured(true);
      setGatewayStatus({ type: 'starting' });
      const info = await tauri.startGateway();
      setGatewayStatus({ type: 'running', info });
      setScreen('chat');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setGatewayStatus({ type: 'error', message });
    } finally {
      setSaving(false);
    }
  };

  const runtimeReady = runtimeStatus.type === 'installed';

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#0a0a0a] text-[#fafafa] antialiased p-8">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-[28px] font-medium tracking-[-0.02em] mb-3">Set up OpenClaw</h1>
          <p className="text-[15px] text-white/50 leading-relaxed">
            Your key stays on your computer. We never see it.
          </p>
        </div>

        {/* Runtime status - only show if not ready */}
        {!runtimeReady && (
          <div className="mb-6 p-5 rounded-xl bg-white/[0.02] border border-white/10">
            <RuntimeStatusDisplay runtimeStatus={runtimeStatus} onRetry={handleInstallRuntime} />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-6 p-5 rounded-xl bg-white/[0.02] border border-white/10">
            <p className="text-[15px] text-white/70 mb-1">Something went wrong</p>
            <p className="text-[13px] text-white/40">{error}</p>
          </div>
        )}

        {/* Step 1: Choose Provider */}
        <div className="mb-6">
          <p className="text-[13px] text-white/40 mb-3">Step 1: Choose your AI provider</p>
          <div className="grid grid-cols-2 gap-2">
            <ProviderButton
              provider="anthropic"
              label="Anthropic"
              selected={selectedProvider === 'anthropic'}
              disabled={!runtimeReady}
              onSelect={() => setSelectedProvider('anthropic')}
            />
            <ProviderButton
              provider="openai"
              label="OpenAI"
              selected={selectedProvider === 'openai'}
              disabled={!runtimeReady}
              onSelect={() => setSelectedProvider('openai')}
            />
            <ProviderButton
              provider="google"
              label="Gemini"
              selected={selectedProvider === 'google'}
              disabled={!runtimeReady}
              onSelect={() => setSelectedProvider('google')}
            />
            <ProviderButton
              provider="openrouter"
              label="OpenRouter"
              selected={selectedProvider === 'openrouter'}
              disabled={!runtimeReady}
              onSelect={() => setSelectedProvider('openrouter')}
            />
          </div>
        </div>

        {/* Step 2: Enter API Key */}
        <div className="mb-6">
          <p className="text-[13px] text-white/40 mb-3">Step 2: Enter your API key</p>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={
              selectedProvider
                ? PROVIDER_INFO[selectedProvider].placeholder
                : 'Select a provider first...'
            }
            className="w-full px-4 py-3 rounded-xl bg-white/[0.02] border border-white/10 text-[15px] placeholder-white/30 focus:outline-none focus:border-white/20 font-mono transition-colors"
            disabled={saving || !runtimeReady || !selectedProvider}
          />
          {selectedProvider && (
            <p className="mt-2 text-[12px] text-white/30">
              Get your key from{' '}
              <a
                href={PROVIDER_INFO[selectedProvider].url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/50 hover:text-white/70 transition-colors underline"
              >
                {PROVIDER_INFO[selectedProvider].name}
              </a>
            </p>
          )}
        </div>

        {/* Continue Button */}
        <ContinueButton
          apiKey={apiKey}
          selectedProvider={selectedProvider}
          saving={saving}
          runtimeReady={runtimeReady}
          onClick={handleSave}
        />

        {/* Runtime info footer */}
        {runtimeReady && runtimeDetails && (
          <p className="mt-6 text-[11px] text-white/20 text-center">
            <Check className="w-3 h-3 inline mr-1 text-green-500/50" />
            Node.js {runtimeDetails.version} ready
          </p>
        )}
      </div>
    </div>
  );
}
