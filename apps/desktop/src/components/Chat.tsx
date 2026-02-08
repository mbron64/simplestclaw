import { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Loader2, AlertCircle, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { createOpenClawClient, type Message, type ConnectionState } from '@simplestclaw/openclaw-client';
import { useAppStore } from '../lib/store';
import { tauri } from '../lib/tauri';

export function Chat() {
  const { gatewayStatus, setScreen, addActivityLog } = useAppStore();
  const [messages, setMessages] = useState<Message[]>([]);
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

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Auto-dismiss error after 8 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 8000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  useEffect(() => {
    console.log('[Chat] useEffect triggered, gatewayUrl:', gatewayUrl, 'gatewayToken:', gatewayToken?.substring(0, 10) + '...');
    if (!gatewayUrl || !gatewayToken) {
      console.log('[Chat] Missing gatewayUrl or gatewayToken, skipping connect');
      return;
    }

    // Track if this effect instance is still active (for React Strict Mode)
    let isActive = true;

    console.log('[Chat] Creating OpenClaw client...');
    const client = createOpenClawClient({
      url: gatewayUrl,
      token: gatewayToken,
      autoReconnect: true,
    });

    client
      .on('onStateChange', (state) => {
        console.log('[Chat] State change:', state, 'isActive:', isActive);
        if (isActive) setConnectionState(state);
      })
      .on('onMessage', (msg) => {
        console.log('[Chat] Message received:', msg);
        if (isActive) {
          setMessages((prev) => [...prev, msg]);
          // Log AI response activity
          if (msg.role === 'assistant') {
            addActivityLog({
              operationType: 'api_call',
              details: `AI response received (${msg.content.length} chars)`,
              status: 'success',
            });
            // Also persist to backend
            tauri.addActivityEntry('api_call', `AI response received (${msg.content.length} chars)`, 'success').catch(() => {});
          }
        }
      })
      .on('onConnect', () => {
        console.log('[Chat] Connected!');
        addActivityLog({
          operationType: 'gateway',
          details: 'Connected to OpenClaw gateway',
          status: 'success',
        });
        tauri.addActivityEntry('gateway', 'Connected to OpenClaw gateway', 'success').catch(() => {});
      })
      .on('onError', (err) => {
        console.error('[Chat] Error:', err);
        addActivityLog({
          operationType: 'gateway',
          details: `Gateway error: ${err.message || err}`,
          status: 'failed',
        });
        tauri.addActivityEntry('gateway', `Gateway error: ${err.message || err}`, 'failed').catch(() => {});
      })
      .on('onDisconnect', (reason) => {
        console.log('[Chat] Disconnected:', reason);
        addActivityLog({
          operationType: 'gateway',
          details: `Disconnected: ${reason || 'unknown'}`,
          status: 'success',
        });
        tauri.addActivityEntry('gateway', `Disconnected: ${reason || 'unknown'}`, 'success').catch(() => {});
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
  }, [gatewayUrl, gatewayToken]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || connectionState !== 'connected') return;

    // Clear any previous error
    setError(null);

    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: input,
      timestamp: Date.now(),
    };

    const messageContent = input;
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      await clientRef.current?.sendMessage(messageContent);
      addActivityLog({
        operationType: 'api_call',
        details: `Message sent (${messageContent.length} chars)`,
        status: 'success',
      });
      tauri.addActivityEntry('api_call', `Message sent (${messageContent.length} chars)`, 'success').catch(() => {});
    } catch (err) {
      console.error('Failed to send message:', err);
      
      // Show user-friendly error message
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (errorMessage.includes('timed out')) {
        setError('Response timed out. The AI might be overloaded - please try again.');
      } else if (errorMessage.includes('Not connected')) {
        setError('Connection lost. Reconnecting...');
      } else {
        setError(`Failed to send: ${errorMessage}`);
      }
      
      addActivityLog({
        operationType: 'api_call',
        details: `Failed to send message: ${err}`,
        status: 'failed',
      });
      tauri.addActivityEntry('api_call', `Failed to send message: ${err}`, 'failed').catch(() => {});
    } finally {
      setIsLoading(false);
    }
  };

  // Ambient status - tiny dot, not screaming
  const getStatusColor = () => {
    switch (connectionState) {
      case 'connected': return 'bg-emerald-500';
      case 'connecting': return 'bg-white/50';
      default: return 'bg-white/20';
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#0a0a0a] text-[#fafafa] antialiased">
      {/* Error Toast */}
      {error && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 max-w-md">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span className="text-[13px]">{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="ml-auto text-red-400/60 hover:text-red-400 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Header - minimal, ambient */}
      <header className="flex items-center justify-between px-6 h-14 border-b border-white/5">
        <div className="flex items-center gap-3">
          <span className={`w-2 h-2 rounded-full ${getStatusColor()}`} />
          <span className="text-[15px] font-medium tracking-tight">simplestclaw</span>
        </div>
        <button
          onClick={() => setScreen('settings')}
          className="text-[13px] text-white/40 hover:text-white/70 transition-colors"
        >
          Settings
        </button>
      </header>

      {/* Messages - content is king */}
      <div className="flex-1 overflow-y-auto px-6 py-8">
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
      <div className="px-6 py-4 border-t border-white/5">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
          <div className="flex gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={connectionState === 'connected' ? 'Message...' : 'Connecting...'}
              disabled={connectionState !== 'connected' || isLoading}
              className="flex-1 px-4 py-3 rounded-xl bg-white/[0.02] border border-white/10 text-[15px] placeholder-white/30 focus:outline-none focus:border-white/20 disabled:opacity-50 transition-colors"
              autoFocus
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
        </form>
      </div>
    </div>
  );
}
