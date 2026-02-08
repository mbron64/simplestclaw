import { useCallback, useEffect, useRef } from 'react';
import { Chat } from './components/Chat';
import { Loading } from './components/Loading';
import { Onboarding } from './components/Onboarding';
import { SettingsPanel } from './components/SettingsPanel';
import { useAppStore } from './lib/store';
import { tauri } from './lib/tauri';

function App() {
  const { screen, setScreen, setGatewayStatus, setRuntimeStatus, setApiKeyConfigured, setError } =
    useAppStore();

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isInitializedRef = useRef(false); // Prevent double init from React Strict Mode

  // Poll runtime status during download
  const pollRuntimeStatus = useCallback(async () => {
    try {
      const status = await tauri.getRuntimeStatus();

      if (status.error) {
        setRuntimeStatus({ type: 'error', message: status.error });
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        return false;
      }

      if (status.downloading) {
        setRuntimeStatus({ type: 'downloading', progress: status.downloadProgress });
        return false; // Still downloading
      }

      if (status.installed) {
        setRuntimeStatus({ type: 'installed', version: status.version || 'unknown' });
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        return true; // Ready to proceed
      }

      return false;
    } catch (err) {
      console.error('Failed to get runtime status:', err);
      return false;
    }
  }, [setRuntimeStatus]);

  // Start gateway after runtime is ready
  const startApp = useCallback(async () => {
    try {
      // Check if API key is configured
      const hasKey = await tauri.hasApiKey();
      setApiKeyConfigured(hasKey);

      if (!hasKey) {
        setScreen('onboarding');
        return;
      }

      // API key exists, try to start gateway
      setGatewayStatus({ type: 'starting' });
      const info = await tauri.startGateway();
      setGatewayStatus({ type: 'running', info });
      setScreen('chat');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setGatewayStatus({ type: 'error', message });
      setScreen('onboarding');
    }
  }, [setScreen, setGatewayStatus, setApiKeyConfigured, setError]);

  useEffect(() => {
    // Prevent double initialization from React Strict Mode
    if (isInitializedRef.current) {
      console.log('[App] Already initialized, skipping');
      return;
    }
    isInitializedRef.current = true;

    async function init() {
      console.log('[App] Initializing...');
      setRuntimeStatus({ type: 'checking' });

      // Check if upgrade is needed (old Node version installed)
      const needsUpgrade = await tauri.needsRuntimeUpgrade();
      if (needsUpgrade) {
        console.log('[App] Node.js upgrade required, installing new version...');
        setRuntimeStatus({ type: 'downloading', progress: 0 });
        // Trigger install which will clean up old version and download new one
        tauri.installRuntime().catch(err => {
          console.error('[App] Runtime upgrade failed:', err);
        });
      }

      // Check initial runtime status
      const isReady = await pollRuntimeStatus();

      if (isReady) {
        // Runtime already installed with correct version, start the app
        await startApp();
      } else {
        // Start polling for download progress
        pollIntervalRef.current = setInterval(async () => {
          const ready = await pollRuntimeStatus();
          if (ready) {
            await startApp();
          }
        }, 500); // Poll every 500ms
      }
    }

    init();

    return () => {
      console.log('[App] Cleanup');
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [pollRuntimeStatus, startApp, setRuntimeStatus]);

  switch (screen) {
    case 'loading':
      return <Loading />;
    case 'onboarding':
      return <Onboarding />;
    case 'settings':
      return <SettingsPanel />;
    case 'chat':
      return <Chat />;
    default:
      return <Loading />;
  }
}

export default App;
