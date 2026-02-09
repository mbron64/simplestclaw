import { getVersion } from '@tauri-apps/api/app';
import { AlertCircle, Check, Eye, EyeOff, Loader2, LogOut, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '../../lib/store';
import {
  type AppDataInfo,
  type Provider,
  type RuntimeStatus as TauriRuntimeStatus,
  tauri,
} from '../../lib/tauri';

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

// Provider Icons (matching onboarding page)
const PROVIDER_ICONS: Record<Provider, React.ReactNode> = {
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
            className={`px-4 py-3 rounded-xl border transition-all flex items-center gap-3 ${
              provider === p
                ? 'bg-white/10 border-white/30'
                : 'bg-white/[0.02] border-white/10 hover:bg-white/[0.05] hover:border-white/20'
            } ${saving ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {PROVIDER_ICONS[p]}
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

// Confirmation Dialog Component (ARIA alertdialog pattern)
function ConfirmDeleteDialog({
  onConfirm,
  onCancel,
  isDeleting,
}: {
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting: boolean;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Focus trap and ESC key handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isDeleting) {
        onCancel();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    dialogRef.current?.focus();
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel, isDeleting]);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm">
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-labelledby="confirm-delete-title"
        aria-describedby="confirm-delete-desc"
        tabIndex={-1}
        className="bg-[#1a1a1a] rounded-xl p-6 max-w-md border border-white/10 shadow-2xl mx-4 focus:outline-none"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
            <AlertCircle className="w-5 h-5 text-red-400" />
          </div>
          <h3 id="confirm-delete-title" className="text-[17px] font-medium text-white">
            Are you sure?
          </h3>
        </div>
        <p id="confirm-delete-desc" className="text-[14px] text-white/60 leading-relaxed">
          This will <span className="text-red-400 font-medium">permanently delete</span> all app
          data including:
        </p>
        <ul className="mt-3 space-y-1 text-[13px] text-white/50">
          <li className="flex items-center gap-2">
            <span className="w-1 h-1 rounded-full bg-white/30" />
            Your API key
          </li>
          <li className="flex items-center gap-2">
            <span className="w-1 h-1 rounded-full bg-white/30" />
            Node.js runtime (~45MB)
          </li>
          <li className="flex items-center gap-2">
            <span className="w-1 h-1 rounded-full bg-white/30" />
            Activity history
          </li>
        </ul>
        <p className="mt-3 text-[13px] text-white/40">
          You'll need to set up the app again from scratch.
        </p>
        <div className="flex gap-3 mt-6 justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={isDeleting}
            className="px-4 py-2 rounded-lg bg-white/10 text-[14px] font-medium text-white/80 hover:bg-white/20 transition-all disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="px-4 py-2 rounded-lg bg-red-500/20 text-[14px] font-medium text-red-400 hover:bg-red-500/30 transition-all disabled:opacity-50 flex items-center gap-2"
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Deleting...
              </>
            ) : (
              'Yes, Delete Everything'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// Reset Data Section Component
function ResetDataSection({
  onResetComplete,
}: {
  onResetComplete: () => void;
}) {
  const { addActivityLog, setScreen, setGatewayStatus, setApiKeyConfigured } = useAppStore();
  const [dataInfo, setDataInfo] = useState<AppDataInfo | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load data info on mount
  useEffect(() => {
    tauri.getAppDataInfo().then(setDataInfo).catch(console.error);
  }, []);

  const handleDeleteClick = useCallback(() => {
    setShowConfirm(true);
  }, []);

  const handleCancel = useCallback(() => {
    if (!isDeleting) {
      setShowConfirm(false);
    }
  }, [isDeleting]);

  const handleConfirmDelete = useCallback(async () => {
    setIsDeleting(true);
    setError(null);

    try {
      // Stop gateway first
      try {
        await tauri.stopGateway();
      } catch {
        // Ignore errors stopping gateway
      }

      // Delete all data
      await tauri.deleteAllAppData();

      addActivityLog({
        operationType: 'gateway',
        details: 'All app data deleted - reset to fresh state',
        status: 'success',
      });

      // Reset app state
      setGatewayStatus({ type: 'stopped' });
      setApiKeyConfigured(false);

      // Navigate to loading screen (which will go to onboarding)
      setScreen('loading');
      onResetComplete();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      console.error('Failed to delete app data:', err);
    } finally {
      setIsDeleting(false);
      setShowConfirm(false);
    }
  }, [addActivityLog, setGatewayStatus, setApiKeyConfigured, setScreen, onResetComplete]);

  return (
    <>
      <section className="pt-4 border-t border-white/5">
        <h2 className="text-[15px] font-medium mb-1">Reset All Data</h2>
        <p className="text-[13px] text-white/40 mb-4">
          Delete all app data including API key, Node.js runtime, and activity history. Use this to
          start fresh or before uninstalling.
        </p>

        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/10 space-y-3 mb-4">
          <div className="flex items-center justify-between">
            <span className="text-[14px] text-white/60">Data stored</span>
            <span className="text-[14px] text-white/80 font-mono">
              {dataInfo?.totalSizeFormatted ?? '...'}
            </span>
          </div>
          {dataInfo?.configPath && (
            <div className="flex items-center justify-between">
              <span className="text-[14px] text-white/60">Location</span>
              <span
                className="text-[12px] text-white/50 font-mono truncate max-w-[280px]"
                title={dataInfo.configPath}
              >
                {dataInfo.configPath}
              </span>
            </div>
          )}
        </div>

        {error && (
          <div className="flex items-center gap-2 text-[13px] text-red-400 mb-4">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={handleDeleteClick}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-[14px] font-medium text-red-400 hover:bg-red-500/20 hover:border-red-500/30 transition-all"
        >
          <Trash2 className="w-4 h-4" />
          Delete All Data
        </button>
      </section>

      {showConfirm && (
        <ConfirmDeleteDialog
          onConfirm={handleConfirmDelete}
          onCancel={handleCancel}
          isDeleting={isDeleting}
        />
      )}
    </>
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

  const handleResetComplete = useCallback(() => {
    // This callback is called after successful data deletion
    // The screen will already be set to 'loading' which will transition to onboarding
  }, []);

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
        <ResetDataSection onResetComplete={handleResetComplete} />
      </div>
    </div>
  );
}
