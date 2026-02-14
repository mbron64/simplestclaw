import {
  type ConnectionState,
  type Message,
  createOpenClawClient,
} from '@simplestclaw/openclaw-client';
import { ChevronDown, Loader2, Send, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { useAppStore } from '../lib/store';
import { tauri } from '../lib/tauri';

// Managed models available through SimplestClaw proxy
// Keep in sync with @simplestclaw/models (packages/models/src/index.ts)
const MANAGED_MODELS = [
  { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5', provider: 'Anthropic' },
  { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', provider: 'Anthropic' },
  { id: 'gpt-5-mini', name: 'GPT-5 Mini', provider: 'OpenAI' },
  { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro', provider: 'Google' },
  { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash', provider: 'Google' },
] as const;

// Provider display names for BYO mode
const BYO_PROVIDERS: Record<string, { name: string; model: string }> = {
  anthropic: { name: 'Claude', model: 'Your Claude model' },
  openai: { name: 'OpenAI', model: 'Your OpenAI model' },
  google: { name: 'Gemini', model: 'Your Gemini model' },
  openrouter: { name: 'OpenRouter', model: 'Your OpenRouter model' },
};

// Unified model selector shown below the input box
// Shows all available options in sections: managed models, BYO key, etc.
function ModelIndicator() {
  const { setGatewayStatus } = useAppStore();
  const [open, setOpen] = useState(false);
  const [currentModel, setCurrentModel] = useState<string>(MANAGED_MODELS[0].id);
  const [apiMode, setApiMode] = useState<string>('byo');
  const [provider, setProvider] = useState<string>('anthropic');
  const [hasApiKey, setHasApiKey] = useState(false);
  const [hasLicenseKey, setHasLicenseKey] = useState(false);
  const [switching, setSwitching] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    tauri.getConfig().then((config) => {
      setApiMode(config.apiMode || 'byo');
      setProvider(config.provider || 'anthropic');
      setHasApiKey(config.hasApiKey);
      setHasLicenseKey(!!config.licenseKey);
      if (config.selectedModel) {
        setCurrentModel(config.selectedModel);
      }
    }).catch(() => {});
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Select a managed model
  const handleSelectManaged = async (modelId: string) => {
    const modeChanged = apiMode !== 'managed';
    setCurrentModel(modelId);
    setApiMode('managed');
    setOpen(false);

    try {
      await tauri.setSelectedModel(modelId);
      if (modeChanged) {
        await tauri.setApiMode('managed');
        // Restart gateway to switch provider config
        setSwitching(true);
        try { await tauri.stopGateway(); } catch { /* ok */ }
        setGatewayStatus({ type: 'starting' });
        const info = await tauri.startGateway();
        setGatewayStatus({ type: 'running', info });
      }
    } catch (err) {
      console.error('Failed to switch model:', err);
    } finally {
      setSwitching(false);
    }
  };

  // Select BYO mode
  const handleSelectByo = async () => {
    const modeChanged = apiMode !== 'byo';
    setApiMode('byo');
    setOpen(false);

    if (modeChanged) {
      try {
        await tauri.setApiMode('byo');
        // Restart gateway to switch provider config
        setSwitching(true);
        try { await tauri.stopGateway(); } catch { /* ok */ }
        setGatewayStatus({ type: 'starting' });
        const info = await tauri.startGateway();
        setGatewayStatus({ type: 'running', info });
      } catch (err) {
        console.error('Failed to switch to BYO:', err);
      } finally {
        setSwitching(false);
      }
    }
  };

  // Determine current display label
  const getDisplayLabel = () => {
    if (switching) return 'Switching…';
    if (apiMode === 'byo') {
      return BYO_PROVIDERS[provider]?.name || provider;
    }
    return MANAGED_MODELS.find((m) => m.id === currentModel)?.name || currentModel;
  };

  const getDisplaySublabel = () => {
    if (switching) return '';
    if (apiMode === 'byo') return 'your key';
    return '';
  };

  // Only show dropdown if there's more than one section to choose from
  const hasMultipleOptions = hasLicenseKey || hasApiKey;

  // If nothing is configured at all, show a simple label
  if (!hasMultipleOptions && !hasLicenseKey && !hasApiKey) {
    return (
      <div className="flex items-center gap-1.5 text-[12px] text-white/30">
        <span className="w-1.5 h-1.5 rounded-full bg-white/20" />
        {getDisplayLabel()}
      </div>
    );
  }

  const sublabel = getDisplaySublabel();

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        onClick={() => !switching && setOpen(!open)}
        className={`flex items-center gap-1 text-[12px] text-white/30 hover:text-white/50 transition-all ${switching ? 'opacity-50 cursor-wait' : ''}`}
        disabled={switching}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${switching ? 'bg-yellow-400/60 animate-pulse' : 'bg-white/20'}`} />
        {getDisplayLabel()}
        {sublabel && (
          <>
            <span className="text-white/15">·</span>
            <span className="text-white/20">{sublabel}</span>
          </>
        )}
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-64 rounded-xl bg-[#1a1a1a] border border-white/10 shadow-2xl z-50 overflow-hidden">

          {/* ── Managed models section ── */}
          {hasLicenseKey && (
            <>
              <div className="px-3 pt-2.5 pb-1.5">
                <span className="text-[10px] font-medium uppercase tracking-wider text-white/25">SimplestClaw</span>
              </div>
              {MANAGED_MODELS.map((model) => (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => handleSelectManaged(model.id)}
                  className={`w-full px-3 py-2 text-left transition-colors flex items-center justify-between ${
                    apiMode === 'managed' && model.id === currentModel
                      ? 'bg-white/10 text-white'
                      : 'text-white/60 hover:bg-white/5 hover:text-white/80'
                  }`}
                >
                  <span className="text-[13px]">{model.name}</span>
                  <span className="text-[11px] text-white/25">{model.provider}</span>
                </button>
              ))}
            </>
          )}

          {/* ── BYO API key section ── */}
          {hasApiKey && (
            <>
              {hasLicenseKey && <div className="mx-3 my-1 border-t border-white/[0.06]" />}
              <div className="px-3 pt-2.5 pb-1.5">
                <span className="text-[10px] font-medium uppercase tracking-wider text-white/25">Your API Key</span>
              </div>
              <button
                type="button"
                onClick={handleSelectByo}
                className={`w-full px-3 py-2 text-left transition-colors flex items-center justify-between ${
                  apiMode === 'byo'
                    ? 'bg-white/10 text-white'
                    : 'text-white/60 hover:bg-white/5 hover:text-white/80'
                }`}
              >
                <span className="text-[13px]">{BYO_PROVIDERS[provider]?.model || 'Your model'}</span>
                <span className="text-[11px] text-white/25">{BYO_PROVIDERS[provider]?.name || provider}</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Error Toast Component
function ErrorToast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 8000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 backdrop-blur-sm">
        <span className="text-[14px] text-red-400">{message}</span>
        <button
          type="button"
          onClick={onDismiss}
          className="text-red-400/60 hover:text-red-400 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// Get user-friendly error message
function getErrorMessage(error: unknown): string {
  const errorStr = String(error);
  if (errorStr.includes('timed out') || errorStr.includes('timeout')) {
    return 'Response timed out. The AI might be overloaded - please try again.';
  }
  if (errorStr.includes('not connected') || errorStr.includes('disconnected')) {
    return 'Connection lost. Reconnecting...';
  }
  return `Error: ${errorStr.replace(/^Error:\s*/i, '')}`;
}

export function Chat() {
  const { gatewayStatus, setScreen, addActivityLog, messages, addMessage } = useAppStore();
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [error, setError] = useState<string | null>(null);

  const clientRef = useRef<ReturnType<typeof createOpenClawClient> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const gatewayUrl = gatewayStatus.type === 'running' ? gatewayStatus.info.url : '';
  const gatewayToken = gatewayStatus.type === 'running' ? gatewayStatus.info.token : '';

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Scroll to bottom when messages change - messages is intentionally in deps to trigger scroll
  // biome-ignore lint/correctness/useExhaustiveDependencies: messages is intentionally included to trigger scroll on new messages
  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (!gatewayUrl || !gatewayToken) {
      return;
    }

    // Track if this effect instance is still active (for React Strict Mode)
    let isActive = true;
    const client = createOpenClawClient({
      url: gatewayUrl,
      token: gatewayToken,
      autoReconnect: true,
    });

    client
      .on('onStateChange', (state) => {
        if (isActive) setConnectionState(state);
      })
      .on('onMessage', (msg) => {
        if (isActive) {
          addMessage(msg);
          // Log AI response activity
          if (msg.role === 'assistant') {
            addActivityLog({
              operationType: 'api_call',
              details: `AI response received (${msg.content.length} chars)`,
              status: 'success',
            });
            // Also persist to backend
            tauri
              .addActivityEntry(
                'api_call',
                `AI response received (${msg.content.length} chars)`,
                'success'
              )
              .catch(() => {});
          }
        }
      })
      .on('onConnect', () => {
        addActivityLog({
          operationType: 'gateway',
          details: 'Connected to OpenClaw gateway',
          status: 'success',
        });
        tauri
          .addActivityEntry('gateway', 'Connected to OpenClaw gateway', 'success')
          .catch(() => {});
      })
      .on('onError', (err) => {
        console.error('[Chat] Error:', err);
        addActivityLog({
          operationType: 'gateway',
          details: `Gateway error: ${err.message || err}`,
          status: 'failed',
        });
        tauri
          .addActivityEntry('gateway', `Gateway error: ${err.message || err}`, 'failed')
          .catch(() => {});
      })
      .on('onDisconnect', (reason) => {
        console.log('[Chat] Disconnected:', reason);
        addActivityLog({
          operationType: 'gateway',
          details: `Disconnected: ${reason || 'unknown'}`,
          status: 'success',
        });
        tauri
          .addActivityEntry('gateway', `Disconnected: ${reason || 'unknown'}`, 'success')
          .catch(() => {});
      });

    clientRef.current = client;

    // Small delay to avoid React Strict Mode double-invoke issues
    const connectTimeout = setTimeout(() => {
      console.log('[Chat] Attempting to connect, isActive:', isActive);
      if (isActive) {
        client.connect().catch((err) => {
          console.error('[Chat] Failed to connect:', err);
        });
      }
    }, 100);

    return () => {
      isActive = false;
      clearTimeout(connectTimeout);
      // Only disconnect if actually connected
      if (client.getState() !== 'disconnected') {
        client.disconnect();
      }
    };
  }, [gatewayUrl, gatewayToken, addActivityLog, addMessage]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || connectionState !== 'connected') return;

    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: input,
      timestamp: Date.now(),
    };

    addMessage(userMessage);
    setInput('');
    setIsLoading(true);

    // Capture input for logging since we clear it immediately
    const messageContent = input;

    try {
      await clientRef.current?.sendMessage(messageContent);
      addActivityLog({
        operationType: 'api_call',
        details: `Message sent (${messageContent.length} chars)`,
        status: 'success',
      });
      tauri
        .addActivityEntry('api_call', `Message sent (${messageContent.length} chars)`, 'success')
        .catch(() => {});
    } catch (err) {
      console.error('Failed to send message:', err);
      const errorMsg = getErrorMessage(err);
      setError(errorMsg);
      addActivityLog({
        operationType: 'api_call',
        details: `Failed to send message: ${err}`,
        status: 'failed',
      });
      tauri
        .addActivityEntry('api_call', `Failed to send message: ${err}`, 'failed')
        .catch(() => {});
    } finally {
      setIsLoading(false);
    }
  };

  // Ambient status - tiny dot, not screaming
  const getStatusColor = () => {
    switch (connectionState) {
      case 'connected':
        return 'bg-emerald-500';
      case 'connecting':
        return 'bg-white/50';
      default:
        return 'bg-white/20';
    }
  };

  const dismissError = useCallback(() => setError(null), []);

  return (
    <div className="flex flex-col h-screen bg-[#0a0a0a] text-[#fafafa] antialiased">
      {/* Error Toast */}
      {error && <ErrorToast message={error} onDismiss={dismissError} />}

      {/* Header - minimal, ambient */}
      <header className="flex items-center justify-between px-6 h-14 border-b border-white/5">
        <div className="flex items-center gap-3">
          <span className={`w-2 h-2 rounded-full ${getStatusColor()}`} />
          <span className="text-[15px] font-medium tracking-tight">simplestclaw</span>
        </div>
        <button
          type="button"
          onClick={() => setScreen('settings')}
          className="text-[13px] text-white/40 hover:text-white/70 transition-colors"
        >
          Settings
        </button>
      </header>

      {/* Messages - content is king */}
      <div className="flex-1 overflow-y-auto scrollbar-hide px-6 py-8">
        {messages.length === 0 && connectionState === 'connected' && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <p className="text-[17px] text-white/50 mb-2">Ready</p>
            <p className="text-[15px] text-white/30">Send a message to get started</p>
          </div>
        )}

        <div className="max-w-3xl mx-auto space-y-6">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-5 py-3 ${
                  message.role === 'user'
                    ? 'bg-white text-black'
                    : 'bg-white/[0.02] border border-white/10'
                }`}
              >
                {message.role === 'assistant' ? (
                  <div className="prose prose-sm prose-invert max-w-none text-[15px] leading-relaxed">
                    <ReactMarkdown>{message.content}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-[15px] leading-relaxed">{message.content}</p>
                )}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-white/[0.02] border border-white/10 rounded-2xl px-5 py-3">
                <Loader2 className="w-5 h-5 animate-spin text-white/30" />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input - simple, inviting */}
      <div className="px-6 pt-3 pb-4 border-t border-white/5">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
          <div className="flex gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={connectionState === 'connected' ? 'Message...' : 'Connecting...'}
              disabled={connectionState !== 'connected' || isLoading}
              className="flex-1 px-4 py-3 rounded-xl bg-white/[0.02] border border-white/10 text-[15px] placeholder-white/30 focus:outline-none focus:border-white/20 disabled:opacity-50 transition-colors"
            />
            <button
              type="submit"
              disabled={!input.trim() || connectionState !== 'connected' || isLoading}
              className={`px-4 py-3 rounded-xl text-[15px] font-medium transition-all ${
                input.trim() && connectionState === 'connected' && !isLoading
                  ? 'bg-white text-black hover:bg-white/90'
                  : 'bg-white/5 text-white/30 cursor-not-allowed'
              }`}
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </div>
          <div className="mt-1.5 px-1">
            <ModelIndicator />
          </div>
        </form>
      </div>
    </div>
  );
}
