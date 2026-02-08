/**
 * OpenClaw Gateway WebSocket Client
 *
 * Implements the OpenClaw Gateway protocol (v3) for connecting to
 * local or remote OpenClaw instances.
 *
 * Protocol docs: https://docs.clawd.bot/gateway/protocol
 */

export type {
  GatewayConfig,
  GatewayEventHandlers,
  ConnectionState,
  Message,
  ToolCall,
} from './types';
export { OpenClawClient } from './client';
export { createOpenClawClient } from './client';
