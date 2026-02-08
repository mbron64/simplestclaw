import { getVersion } from '@tauri-apps/api/app';
import { AlertCircle, Check, Eye, EyeOff, Loader2, LogOut } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAppStore } from '../../lib/store';
import { type Provider, type RuntimeStatus as TauriRuntimeStatus, tauri } from '../../lib/tauri';

const PROVIDER_INFO: Record<Provider, { name: string; placeholder: string; url: string }> = {
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

// Provider Section Component
function ProviderSection({
  provider,
  onProviderChange,
  saving,
}: {
  provider: Provider;
  onProviderChange: (p: Provider) => void;
  saving: boolean;
}) {
  return (
    <section>
      <h2 className="text-[15px] font-medium mb-1">AI Provider</h2>
      <p className="text-[13px] text-white/40 mb-4">Select your AI provider.</p>

      <div className="grid grid-cols-2 gap-2">
        {(Object.keys(PROVIDER_INFO) as Provider[]).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onProviderChange(p)}
            disabled={saving}
            className={`px-4 py-3 rounded-xl border transition-all text-left ${
              provider === p
                ? 'bg-white/10 border-white/30'
                : 'bg-white/[0.02] border-white/10 hover:bg-white/[0.05] hover:border-white/20'
            } ${saving ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <span className="text-[14px] text-white/80">{PROVIDER_INFO[p].name}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

// API Key Section Component
function ApiKeySection({
  apiKey,
  provider,
  onApiKeyChange,
  onSave,
  showKey,
  onToggleShowKey,
  saving,
  saved,
  error,
}: {
  apiKey: string;
  provider: Provider;
  onApiKeyChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSave: () => void;
  showKey: boolean;
  onToggleShowKey: () => void;
  saving: boolean;
  saved: boolean;
  error: string | null;
}) {
  const isMasked = apiKey.includes('••••');
  const canSave = apiKey.trim() && !isMasked && !saving;
  const providerInfo = PROVIDER_INFO[provider];

  return (
    <section>
      <h2 className="text-[15px] font-medium mb-1">API Key</h2>
      <p className="text-[13px] text-white/40 mb-4">
        Your {providerInfo.name} API key. Stored locally on your device.
      </p>

      <div className="space-y-3">
        <div className="relative">
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={onApiKeyChange}
            onFocus={() => {
              if (isMasked) {
                onApiKeyChange({ target: { value: '' } } as React.ChangeEvent<HTMLInputElement>);
              }
            }}
            placeholder={providerInfo.placeholder}
            className="w-full px-4 py-3 pr-12 rounded-xl bg-white/[0.02] border border-white/10 text-[15px] placeholder-white/30 focus:outline-none focus:border-white/20 font-mono transition-colors"
          />
          <button
            type="button"
            onClick={onToggleShowKey}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/50 transition-colors"
          >
            {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-[13px] text-red-400">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={onSave}
          disabled={!canSave}
          className={`px-4 py-2 rounded-lg text-[14px] font-medium transition-all flex items-center gap-2 ${
            canSave
              ? 'bg-white text-black hover:bg-white/90'
              : 'bg-white/5 text-white/30 cursor-not-allowed'
          }`}
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Saving...
            </>
          ) : saved ? (
            <>
              <Check className="w-4 h-4" />
              Saved
            </>
          ) : (
            'Update Key'
          )}
        </button>
      </div>

      <p className="mt-3 text-[12px] text-white/30">
        Get your key from{' '}
        <a
          href={providerInfo.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-white/50 hover:text-white/70 transition-colors underline"
        >
          {providerInfo.name}
        </a>
      </p>
    </section>
  );
}

// Gateway Status Section Component
function GatewayStatusSection() {
  const { gatewayStatus } = useAppStore();

  const getStatusDisplay = () => {
    switch (gatewayStatus.type) {
      case 'running':
        return { text: 'Running', color: 'text-emerald-400' };
      case 'starting':
        return { text: 'Starting...', color: 'text-yellow-400' };
      case 'error':
        return { text: 'Error', color: 'text-red-400' };
      default:
        return { text: 'Stopped', color: 'text-white/40' };
    }
  };

  const statusDisplay = getStatusDisplay();

  return (
    <section>
      <h2 className="text-[15px] font-medium mb-1">Gateway Status</h2>
      <p className="text-[13px] text-white/40 mb-4">OpenClaw gateway connection status.</p>

      <div className="p-4 rounded-xl bg-white/[0.02] border border-white/10 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[14px] text-white/60">Status</span>
          <span className={`text-[14px] font-medium ${statusDisplay.color}`}>
            {statusDisplay.text}
          </span>
        </div>

        {gatewayStatus.type === 'running' && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-[14px] text-white/60">URL</span>
              <span className="text-[14px] text-white/80 font-mono">{gatewayStatus.info.url}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[14px] text-white/60">Port</span>
              <span className="text-[14px] text-white/80 font-mono">{gatewayStatus.info.port}</span>
            </div>
          </>
        )}

        {gatewayStatus.type === 'error' && (
          <div className="text-[13px] text-red-400/80">{gatewayStatus.message}</div>
        )}
      </div>
    </section>
  );
}

// Runtime Status Section Component
function RuntimeStatusSection({ runtimeDetails }: { runtimeDetails: TauriRuntimeStatus | null }) {
  const { runtimeStatus } = useAppStore();

  const getStatusStyle = () => {
    switch (runtimeStatus.type) {
      case 'installed':
        return 'text-emerald-400';
      case 'downloading':
        return 'text-yellow-400';
      case 'error':
        return 'text-red-400';
      default:
        return 'text-white/40';
    }
  };

  const getStatusText = () => {
    switch (runtimeStatus.type) {
      case 'installed':
        return 'Installed';
      case 'downloading':
        return `Downloading (${Math.round(runtimeStatus.progress)}%)`;
      case 'error':
        return 'Error';
      default:
        return 'Checking...';
    }
  };

  return (
    <section>
      <h2 className="text-[15px] font-medium mb-1">Runtime</h2>
      <p className="text-[13px] text-white/40 mb-4">Bundled Node.js runtime for OpenClaw.</p>

      <div className="p-4 rounded-xl bg-white/[0.02] border border-white/10 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[14px] text-white/60">Status</span>
          <span className={`text-[14px] font-medium ${getStatusStyle()}`}>{getStatusText()}</span>
        </div>

        {runtimeStatus.type === 'installed' && (
          <div className="flex items-center justify-between">
            <span className="text-[14px] text-white/60">Version</span>
            <span className="text-[14px] text-white/80 font-mono">{runtimeStatus.version}</span>
          </div>
        )}

        {runtimeDetails?.nodePath && (
          <div className="flex items-center justify-between">
            <span className="text-[14px] text-white/60">Path</span>
            <span
              className="text-[12px] text-white/50 font-mono truncate max-w-[300px]"
              title={runtimeDetails.nodePath}
            >
              {runtimeDetails.nodePath}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}

// App Info Section Component
function AppInfoSection({ version }: { version: string }) {
  return (
    <section>
      <h2 className="text-[15px] font-medium mb-1">About</h2>
      <p className="text-[13px] text-white/40 mb-4">Application information.</p>

      <div className="p-4 rounded-xl bg-white/[0.02] border border-white/10 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[14px] text-white/60">App</span>
          <span className="text-[14px] text-white/80">simplestclaw</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[14px] text-white/60">Version</span>
          <span className="text-[14px] text-white/80 font-mono">{version}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[14px] text-white/60">Source</span>
          <a
            href="https://github.com/mbron64/simplestclaw"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[14px] text-white/50 hover:text-white/70 transition-colors underline"
          >
            GitHub
          </a>
        </div>
      </div>
    </section>
  );
}

// Logout Section Component
function LogoutSection({
  loggingOut,
  onLogout,
}: {
  loggingOut: boolean;
  onLogout: () => void;
}) {
  return (
    <section className="pt-4 border-t border-white/5">
      <h2 className="text-[15px] font-medium mb-1">Account</h2>
      <p className="text-[13px] text-white/40 mb-4">Sign out to change provider or API key.</p>

      <button
        type="button"
        onClick={onLogout}
        disabled={loggingOut}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-[14px] font-medium text-red-400 hover:bg-red-500/20 hover:border-red-500/30 transition-all disabled:opacity-50"
      >
        {loggingOut ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Signing out...
          </>
        ) : (
          <>
            <LogOut className="w-4 h-4" />
            Sign out
          </>
        )}
      </button>
    </section>
  );
}

// Main GeneralTab Component
export function GeneralTab() {
  const { addActivityLog, setScreen, setGatewayStatus, setApiKeyConfigured } = useAppStore();
  const [provider, setProvider] = useState<Provider>('anthropic');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runtimeDetails, setRuntimeDetails] = useState<TauriRuntimeStatus | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [appVersion, setAppVersion] = useState('...');

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Get app version from Tauri
        const version = await getVersion();
        setAppVersion(version);

        const config = await tauri.getConfig();
        setProvider(config.provider || 'anthropic');
        if (config.anthropicApiKey) {
          const placeholder = PROVIDER_INFO[config.provider || 'anthropic'].placeholder;
          setApiKey(`${placeholder.split('...')[0]}••••••••••••••••••••••••••••••••`);
        }
        const runtime = await tauri.getRuntimeStatus();
        setRuntimeDetails(runtime);
      } catch (err) {
        console.error('Failed to fetch config:', err);
      }
    };
    fetchData();
  }, []);

  const handleProviderChange = async (newProvider: Provider) => {
    if (newProvider === provider) return;

    setSaving(true);
    try {
      await tauri.setProvider(newProvider);
      setProvider(newProvider);
      // Clear the API key display since it's for a different provider now
      setApiKey('');
      addActivityLog({
        operationType: 'api_call',
        details: `Switched to ${PROVIDER_INFO[newProvider].name}`,
        status: 'success',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setApiKey(e.target.value);
    setSaved(false);
  };

  const handleSaveKey = async () => {
    if (!apiKey.trim() || apiKey.includes('••••')) return;

    setSaving(true);
    setError(null);

    try {
      await tauri.setApiKey(apiKey.trim());
      addActivityLog({
        operationType: 'api_call',
        details: 'API key updated',
        status: 'success',
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      setApiKey('sk-ant-api03-••••••••••••••••••••••••••••••••');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      addActivityLog({
        operationType: 'api_call',
        details: 'Failed to update API key',
        status: 'failed',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await tauri.stopGateway();
      setGatewayStatus({ type: 'stopped' });
      await tauri.setApiKey('');
      setApiKeyConfigured(false);
      addActivityLog({
        operationType: 'gateway',
        details: 'Logged out and cleared API key',
        status: 'success',
      });
      setScreen('onboarding');
    } catch (err) {
      console.error('Failed to logout:', err);
      setScreen('onboarding');
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="space-y-8">
        <ProviderSection
          provider={provider}
          onProviderChange={handleProviderChange}
          saving={saving}
        />
        <ApiKeySection
          apiKey={apiKey}
          provider={provider}
          onApiKeyChange={handleApiKeyChange}
          onSave={handleSaveKey}
          showKey={showKey}
          onToggleShowKey={() => setShowKey(!showKey)}
          saving={saving}
          saved={saved}
          error={error}
        />
        <GatewayStatusSection />
        <RuntimeStatusSection runtimeDetails={runtimeDetails} />
        <AppInfoSection version={appVersion} />
        <LogoutSection loggingOut={loggingOut} onLogout={handleLogout} />
      </div>
    </div>
  );
}
