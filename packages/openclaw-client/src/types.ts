/**
 * OpenClaw Gateway Protocol Types
 * Based on: https://docs.clawd.bot/gateway/protocol
 */

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface GatewayConfig {
  /** WebSocket URL (e.g., ws://localhost:18789 or wss://your-app.railway.app) */
  url: string;
  /** Optional authentication token */
  token?: string;
  /** Client identifier */
  clientId?: string;
  /** Auto-reconnect on disconnect */
  autoReconnect?: boolean;
  /** Reconnect delay in ms */
  reconnectDelay?: number;
}

export interface GatewayEventHandlers {
  onConnect?: () => void;
  onDisconnect?: (reason?: string) => void;
  onError?: (error: Error) => void;
  onMessage?: (message: Message) => void;
  onToolCall?: (toolCall: ToolCall) => void;
  onStateChange?: (state: ConnectionState) => void;
}

// Protocol message types
export interface GatewayRequest {
  type: 'req';
  id: string;
  method: string;
  params?: Record<string, unknown>;
}

export interface GatewayResponse {
  type: 'res';
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: GatewayError;
}

export interface GatewayEvent {
  type: 'event';
  event: string;
  payload?: unknown;
  seq?: number;
}

export interface GatewayError {
  code: string;
  message: string;
  details?: unknown;
}

// Connect handshake
export interface ConnectChallenge {
  nonce: string;
  ts: number;
}

export interface ConnectParams {
  minProtocol: number;
  maxProtocol: number;
  client: {
    id:
      | 'cli'
      | 'test'
      | 'webchat-ui'
      | 'openclaw-control-ui'
      | 'webchat'
      | 'gateway-client'
      | 'openclaw-macos'
      | 'openclaw-ios'
      | 'openclaw-android'
      | 'node-host'
      | 'fingerprint'
      | 'openclaw-probe';
    version: string;
    platform: string;
    mode: 'cli' | 'node' | 'test' | 'webchat' | 'ui' | 'backend' | 'probe';
  };
  role: 'operator' | 'node';
  scopes: string[];
  auth?: {
    token?: string;
  };
  locale?: string;
  userAgent?: string;
}

export interface HelloOkPayload {
  type: 'hello-ok';
  protocol: number;
  policy?: {
    tickIntervalMs: number;
  };
}

// Chat types
export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  output?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
}

export interface ChatSendParams {
  message: string;
  context?: string[];
  model?: string;
}

export interface StreamingChunk {
  type: 'text' | 'tool_call_start' | 'tool_call_end' | 'done';
  content?: string;
  toolCall?: ToolCall;
}

// Session types
export interface Session {
  id: string;
  createdAt: number;
  lastActiveAt: number;
  messageCount: number;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}
