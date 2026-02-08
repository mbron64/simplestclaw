import type {
  ChatSendParams,
  ConnectChallenge,
  ConnectParams,
  ConnectionState,
  GatewayConfig,
  GatewayEvent,
  GatewayEventHandlers,
  GatewayRequest,
  GatewayResponse,
  Message,
  StreamingChunk,
  ToolCall,
} from './types';

const PROTOCOL_VERSION = 3;
const DEFAULT_RECONNECT_DELAY = 3000;

/**
 * OpenClaw Gateway WebSocket Client
 *
 * Usage:
 * ```ts
 * const client = createOpenClawClient({
 *   url: 'ws://localhost:18789',
 *   token: 'optional-token',
 * });
 *
 * client.on('message', (msg) => console.log(msg));
 * await client.connect();
 * await client.sendMessage('Hello!');
 * ```
 */
export class OpenClawClient {
  private ws: WebSocket | null = null;
  private config: Required<GatewayConfig>;
  private handlers: GatewayEventHandlers = {};
  private state: ConnectionState = 'disconnected';
  private requestId = 0;
  private pendingRequests = new Map<
    string,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
    }
  >();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private sessionKey = 'agent:main:main'; // Default session key

  // Track pending chat messages by runId
  private pendingChats = new Map<
    string,
    {
      content: string;
      resolve: (message: Message) => void;
      reject: (error: Error) => void;
    }
  >();

  constructor(config: GatewayConfig) {
    this.config = {
      url: config.url,
      token: config.token ?? '',
      clientId: config.clientId ?? 'simplestclaw-web',
      autoReconnect: config.autoReconnect ?? true,
      reconnectDelay: config.reconnectDelay ?? DEFAULT_RECONNECT_DELAY,
    };
  }

  /** Register event handlers */
  on<K extends keyof GatewayEventHandlers>(
    event: K,
    handler: NonNullable<GatewayEventHandlers[K]>
  ): this {
    this.handlers[event] = handler as GatewayEventHandlers[K];
    return this;
  }

  /** Get current connection state */
  getState(): ConnectionState {
    return this.state;
  }

  /** Connect to the Gateway */
  async connect(): Promise<void> {
    if (this.state === 'connected' || this.state === 'connecting') {
      return;
    }

    this.setState('connecting');

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.config.url);

        this.ws.onopen = () => {
          // Wait for connect.challenge event
        };

        this.ws.onmessage = async (event) => {
          try {
            const dataStr = typeof event.data === 'string' ? event.data : event.data.toString();
            console.log('[openclaw-client] RAW message:', dataStr.substring(0, 500));
            const data = JSON.parse(dataStr);
            console.log('[openclaw-client] Parsed type:', data.type, 'event:', data.event);
            await this.handleMessage(data, resolve);
          } catch (err) {
            console.error('[openclaw-client] Failed to parse message:', err);
          }
        };

        this.ws.onerror = (event) => {
          const error = new Error('WebSocket error');
          this.handlers.onError?.(error);
          if (this.state === 'connecting') {
            reject(error);
          }
        };

        this.ws.onclose = (event) => {
          this.setState('disconnected');
          this.handlers.onDisconnect?.(event.reason);

          if (this.config.autoReconnect && this.state !== 'error') {
            this.scheduleReconnect();
          }
        };
      } catch (err) {
        this.setState('error');
        reject(err);
      }
    });
  }

  /** Disconnect from the Gateway */
  disconnect(): void {
    this.config.autoReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setState('disconnected');
  }

  /** Send a chat message and stream the response */
  async sendMessage(message: string, onChunk?: (chunk: StreamingChunk) => void): Promise<Message> {
    // Generate unique idempotency key for this request
    const idempotencyKey = `idem-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    const params = {
      sessionKey: this.sessionKey,
      idempotencyKey,
      message,
    };

    console.log(
      '[openclaw-client] Sending chat.send with params:',
      JSON.stringify(params).substring(0, 200)
    );

    // Send the request and get the runId
    const response = (await this.request('chat.send', params)) as { runId: string; status: string };
    const runId = response.runId;
    console.log('[openclaw-client] chat.send started, runId:', runId);

    // Wait for streaming events to complete
    return new Promise((resolve, reject) => {
      this.pendingChats.set(runId, {
        content: '',
        resolve: (msg) => {
          this.pendingChats.delete(runId);
          resolve(msg);
        },
        reject: (err) => {
          this.pendingChats.delete(runId);
          reject(err);
        },
      });

      // Timeout after 2 minutes
      setTimeout(() => {
        if (this.pendingChats.has(runId)) {
          this.pendingChats.delete(runId);
          reject(new Error('Chat response timed out'));
        }
      }, 120000);
    });
  }

  /** Send a request and wait for response */
  private async request<T = Record<string, unknown>>(method: string, params?: T): Promise<unknown> {
    if (!this.ws || this.state !== 'connected') {
      throw new Error('Not connected to Gateway');
    }

    const id = this.nextRequestId();
    const request: GatewayRequest = {
      type: 'req',
      id,
      method,
      params: params as unknown as Record<string, unknown>,
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.ws?.send(JSON.stringify(request));

      // Timeout after 30s
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request ${method} timed out`));
        }
      }, 30000);
    });
  }

  private async handleMessage(
    data: GatewayResponse | GatewayEvent,
    connectResolve?: (value: undefined) => void
  ): Promise<void> {
    if (data.type === 'event') {
      await this.handleEvent(data, connectResolve);
    } else if (data.type === 'res') {
      this.handleResponse(data);
    }
  }

  private async handleEvent(
    event: GatewayEvent,
    connectResolve?: (value: undefined) => void
  ): Promise<void> {
    switch (event.event) {
      case 'connect.challenge':
        await this.sendConnectRequest(event.payload as ConnectChallenge, connectResolve);
        break;
      case 'chat':
        this.handleChatStreamEvent(event.payload as Record<string, unknown>);
        break;
      case 'chat.message':
        this.handlers.onMessage?.(event.payload as Message);
        break;
      case 'tool.call.started':
      case 'tool.call.completed':
        this.handlers.onToolCall?.(event.payload as ToolCall);
        break;
      default:
        console.log('[openclaw-client] Unhandled event:', event.event);
    }
  }

  /** Handle streaming chat events from the gateway */
  private handleChatStreamEvent(payload: Record<string, unknown>): void {
    const runId = payload.runId as string | undefined;
    const state = payload.state as string | undefined;

    console.log('[openclaw-client] Chat event - state:', state, 'runId:', runId);

    // Early return for missing runId
    if (!runId) {
      console.log('[openclaw-client] No runId in chat event');
      return;
    }

    // Early return for unknown runId
    const pending = this.pendingChats.get(runId);
    if (!pending) {
      console.log('[openclaw-client] No pending chat for runId:', runId);
      return;
    }

    const messageText = this.extractMessageText(payload);
    this.processChatState(state, pending, runId, messageText, payload);
  }

  /** Extract text content from chat message payload */
  private extractMessageText(payload: Record<string, unknown>): string {
    const message = payload.message as { role?: string; content?: unknown[] } | undefined;

    console.log(
      '[openclaw-client] Chat message object:',
      JSON.stringify(message).substring(0, 500)
    );

    if (!message?.content || !Array.isArray(message.content)) {
      console.log('[openclaw-client] No content array in message');
      return '';
    }

    const firstContent = message.content[0] as { type?: string; text?: string } | undefined;
    const text = firstContent?.text ?? '';
    console.log('[openclaw-client] Extracted text:', text.substring(0, 100));
    return text;
  }

  /** Process chat state transitions (delta, final, error) */
  private processChatState(
    state: string | undefined,
    pending: { content: string; resolve: (msg: Message) => void; reject: (err: Error) => void },
    runId: string,
    messageText: string,
    payload: Record<string, unknown>
  ): void {
    switch (state) {
      case 'delta':
        if (messageText) {
          pending.content = messageText;
        }
        console.log(
          '[openclaw-client] Delta update, pending.content length:',
          pending.content.length
        );
        break;
      case 'final':
        this.finalizeChatMessage(pending, runId, messageText);
        break;
      case 'error':
        this.handleChatError(pending, payload);
        break;
      default:
        console.log('[openclaw-client] Unknown chat state:', state);
    }
  }

  /** Finalize and resolve a completed chat message */
  private finalizeChatMessage(
    pending: { content: string; resolve: (msg: Message) => void; reject: (err: Error) => void },
    runId: string,
    messageText: string
  ): void {
    if (messageText) {
      pending.content = messageText;
    }
    console.log('[openclaw-client] Final - pending.content:', pending.content.substring(0, 100));

    const assistantMessage: Message = {
      id: `msg-${runId}`,
      role: 'assistant',
      content: pending.content || '(No response)',
      timestamp: Date.now(),
    };

    console.log(
      '[openclaw-client] Resolving with content length:',
      assistantMessage.content.length
    );
    this.handlers.onMessage?.(assistantMessage);
    pending.resolve(assistantMessage);
  }

  /** Handle chat error state */
  private handleChatError(
    pending: { content: string; resolve: (msg: Message) => void; reject: (err: Error) => void },
    payload: Record<string, unknown>
  ): void {
    const errorPayload = payload.error as { message?: string } | undefined;
    const errorMsg = errorPayload?.message ?? 'Chat failed';
    console.error('[openclaw-client] Chat error:', errorMsg);
    pending.reject(new Error(errorMsg));
  }

  private handleResponse(response: GatewayResponse): void {
    const pending = this.pendingRequests.get(response.id);
    if (!pending) return;

    this.pendingRequests.delete(response.id);

    if (response.ok) {
      pending.resolve(response.payload);
    } else {
      pending.reject(new Error(response.error?.message ?? 'Request failed'));
    }
  }

  private async sendConnectRequest(
    challenge: ConnectChallenge,
    connectResolve?: (value: undefined) => void
  ): Promise<void> {
    // Guard clause - ensures WebSocket is initialized before proceeding
    if (!this.ws) {
      throw new Error('WebSocket not initialized');
    }

    // Capture in local variable for type narrowing and closure safety
    const ws = this.ws;
    const id = this.nextRequestId();

    const params: ConnectParams = {
      minProtocol: PROTOCOL_VERSION,
      maxProtocol: PROTOCOL_VERSION,
      client: {
        id: 'gateway-client', // Must be a valid client ID from openclaw schema
        version: '0.1.0',
        platform: typeof window !== 'undefined' ? 'web' : 'node',
        mode: 'ui', // Must be a valid mode from openclaw schema
      },
      role: 'operator',
      scopes: ['operator.read', 'operator.write'],
      locale: 'en-US',
      userAgent: `simplestclaw/${this.config.clientId}`,
    };

    if (this.config.token) {
      params.auth = { token: this.config.token };
    }

    const request: GatewayRequest = {
      type: 'req',
      id,
      method: 'connect',
      params: params as unknown as Record<string, unknown>,
    };

    console.log(
      '[openclaw-client] Sending connect request:',
      JSON.stringify(request).substring(0, 300)
    );
    ws.send(JSON.stringify(request));

    // Wait for hello-ok response
    const originalOnMessage = ws.onmessage;
    ws.onmessage = (event) => {
      try {
        console.log('[openclaw-client] Connect response:', event.data.substring(0, 300));
        const data = JSON.parse(event.data) as GatewayResponse;
        if (data.type === 'res' && data.id === id) {
          if (data.ok) {
            console.log('[openclaw-client] Connected successfully!');

            // Extract session key from hello-ok payload
            const payload = data.payload as {
              snapshot?: { sessionDefaults?: { mainSessionKey?: string } };
            };
            if (payload?.snapshot?.sessionDefaults?.mainSessionKey) {
              this.sessionKey = payload.snapshot.sessionDefaults.mainSessionKey;
              console.log('[openclaw-client] Using session key:', this.sessionKey);
            }

            this.setState('connected');
            this.handlers.onConnect?.();
            connectResolve?.(undefined);
          } else {
            console.error('[openclaw-client] Connection failed:', data.error);
            this.setState('error');
            this.handlers.onError?.(new Error(data.error?.message ?? 'Connection failed'));
          }
          // Restore original handler
          ws.onmessage = originalOnMessage;
        }
      } catch (err) {
        console.error('[openclaw-client] Failed to parse connect response:', err);
      }
    };
  }

  private setState(state: ConnectionState): void {
    this.state = state;
    this.handlers.onStateChange?.(state);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch(console.error);
    }, this.config.reconnectDelay);
  }

  private nextRequestId(): string {
    return `req-${++this.requestId}-${Date.now()}`;
  }
}

/** Create a new OpenClaw client */
export function createOpenClawClient(config: GatewayConfig): OpenClawClient {
  return new OpenClawClient(config);
}
