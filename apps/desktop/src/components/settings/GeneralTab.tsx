import { useState, useEffect } from 'react';
import { Eye, EyeOff, Check, Loader2, AlertCircle, LogOut } from 'lucide-react';
import { useAppStore } from '../../lib/store';
import { tauri, type RuntimeStatus as TauriRuntimeStatus } from '../../lib/tauri';

export function GeneralTab() {
  const { gatewayStatus, runtimeStatus, addActivityLog, setScreen, setGatewayStatus, setApiKeyConfigured } = useAppStore();
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runtimeDetails, setRuntimeDetails] = useState<TauriRuntimeStatus | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  // Load current API key (masked) and runtime details
  useEffect(() => {
    const fetchData = async () => {
      try {
        const config = await tauri.getConfig();
        if (config.anthropicApiKey) {
          // Show masked version
          setApiKey('sk-ant-api03-••••••••••••••••••••••••••••••••');
        }
        const runtime = await tauri.getRuntimeStatus();
        setRuntimeDetails(runtime);
      } catch (err) {
        console.error('Failed to fetch config:', err);
      }
    };
    fetchData();
  }, []);

  const handleSaveKey = async () => {
    // Only save if it's a real key (not the masked placeholder)
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
      // Show masked version after save
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

  const handleKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // If user starts typing in a field with masked key, clear it
    if (apiKey.includes('••••') && !value.includes('••••')) {
      setApiKey(value);
    } else {
      setApiKey(value);
    }
    setSaved(false);
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      // Stop the gateway
      await tauri.stopGateway();
      setGatewayStatus({ type: 'stopped' });
      
      // Clear the API key
      await tauri.setApiKey('');
      setApiKeyConfigured(false);
      
      addActivityLog({
        operationType: 'gateway',
        details: 'Logged out and cleared API key',
        status: 'success',
      });
      
      // Navigate to onboarding
      setScreen('onboarding');
    } catch (err) {
      console.error('Failed to logout:', err);
      // Still navigate to onboarding even if there's an error
      setScreen('onboarding');
    } finally {
      setLoggingOut(false);
    }
  };

  const getGatewayStatusText = () => {
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

  const gatewayStatusDisplay = getGatewayStatusText();

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="space-y-8">
        {/* API Key Section */}
        <section>
          <h2 className="text-[15px] font-medium mb-1">API Key</h2>
          <p className="text-[13px] text-white/40 mb-4">
            Your Anthropic API key. Stored locally on your device.
          </p>

          <div className="space-y-3">
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={handleKeyChange}
                onFocus={() => {
                  // Clear masked key on focus to allow editing
                  if (apiKey.includes('••••')) {
                    setApiKey('');
                  }
                }}
                placeholder="sk-ant-api03-..."
                className="w-full px-4 py-3 pr-12 rounded-xl bg-white/[0.02] border border-white/10 text-[15px] placeholder-white/30 focus:outline-none focus:border-white/20 font-mono transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
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
              onClick={handleSaveKey}
              disabled={!apiKey.trim() || apiKey.includes('••••') || saving}
              className={`px-4 py-2 rounded-lg text-[14px] font-medium transition-all flex items-center gap-2 ${
                apiKey.trim() && !apiKey.includes('••••') && !saving
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
              href="https://console.anthropic.com/settings/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/50 hover:text-white/70 transition-colors underline"
            >
              console.anthropic.com
            </a>
          </p>
        </section>

        {/* Gateway Status Section */}
        <section>
          <h2 className="text-[15px] font-medium mb-1">Gateway Status</h2>
          <p className="text-[13px] text-white/40 mb-4">
            OpenClaw gateway connection status.
          </p>

          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[14px] text-white/60">Status</span>
              <span className={`text-[14px] font-medium ${gatewayStatusDisplay.color}`}>
                {gatewayStatusDisplay.text}
              </span>
            </div>

            {gatewayStatus.type === 'running' && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-[14px] text-white/60">URL</span>
                  <span className="text-[14px] text-white/80 font-mono">
                    {gatewayStatus.info.url}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[14px] text-white/60">Port</span>
                  <span className="text-[14px] text-white/80 font-mono">
                    {gatewayStatus.info.port}
                  </span>
                </div>
              </>
            )}

            {gatewayStatus.type === 'error' && (
              <div className="text-[13px] text-red-400/80">
                {gatewayStatus.message}
              </div>
            )}
          </div>
        </section>

        {/* Runtime Status Section */}
        <section>
          <h2 className="text-[15px] font-medium mb-1">Runtime</h2>
          <p className="text-[13px] text-white/40 mb-4">
            Bundled Node.js runtime for OpenClaw.
          </p>

          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[14px] text-white/60">Status</span>
              <span className={`text-[14px] font-medium ${
                runtimeStatus.type === 'installed' ? 'text-emerald-400' :
                runtimeStatus.type === 'downloading' ? 'text-yellow-400' :
                runtimeStatus.type === 'error' ? 'text-red-400' : 'text-white/40'
              }`}>
                {runtimeStatus.type === 'installed' ? 'Installed' :
                 runtimeStatus.type === 'downloading' ? `Downloading (${Math.round(runtimeStatus.progress)}%)` :
                 runtimeStatus.type === 'error' ? 'Error' : 'Checking...'}
              </span>
            </div>

            {runtimeStatus.type === 'installed' && (
              <div className="flex items-center justify-between">
                <span className="text-[14px] text-white/60">Version</span>
                <span className="text-[14px] text-white/80 font-mono">
                  {runtimeStatus.version}
                </span>
              </div>
            )}

            {runtimeDetails?.nodePath && (
              <div className="flex items-center justify-between">
                <span className="text-[14px] text-white/60">Path</span>
                <span className="text-[12px] text-white/50 font-mono truncate max-w-[300px]" title={runtimeDetails.nodePath}>
                  {runtimeDetails.nodePath}
                </span>
              </div>
            )}
          </div>
        </section>

        {/* App Info Section */}
        <section>
          <h2 className="text-[15px] font-medium mb-1">About</h2>
          <p className="text-[13px] text-white/40 mb-4">
            Application information.
          </p>

          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[14px] text-white/60">App</span>
              <span className="text-[14px] text-white/80">simplestclaw</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[14px] text-white/60">Version</span>
              <span className="text-[14px] text-white/80 font-mono">0.1.0</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[14px] text-white/60">Source</span>
              <a
                href="https://github.com/BoundInCode/simplestclaw"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[14px] text-white/50 hover:text-white/70 transition-colors underline"
              >
                GitHub
              </a>
            </div>
          </div>
        </section>

        {/* Logout Section */}
        <section className="pt-4 border-t border-white/5">
          <h2 className="text-[15px] font-medium mb-1">Account</h2>
          <p className="text-[13px] text-white/40 mb-4">
            Sign out to change provider or API key.
          </p>

          <button
            onClick={handleLogout}
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
      </div>
    </div>
  );
}
