import { invoke } from '@tauri-apps/api/core';
import type { GatewayInfo, ActivityLogEntry } from './store';

export interface Config {
  anthropicApiKey: string | null;
  gatewayPort: number;
  autoStartGateway: boolean;
}

export interface RuntimeStatus {
  installed: boolean;
  version: string | null;
  nodePath: string | null;
  npxPath: string | null;
  downloading: boolean;
  downloadProgress: number;
  error: string | null;
}

export const tauri = {
  // Config
  async getConfig(): Promise<Config> {
    return invoke('get_config');
  },

  async setApiKey(key: string): Promise<void> {
    return invoke('set_api_key', { key });
  },

  async hasApiKey(): Promise<boolean> {
    return invoke('has_api_key');
  },

  // Gateway
  async startGateway(): Promise<GatewayInfo> {
    return invoke('start_gateway');
  },

  async stopGateway(): Promise<void> {
    return invoke('stop_gateway');
  },

  async getGatewayStatus(): Promise<{ running: boolean; info: GatewayInfo | null; error: string | null }> {
    return invoke('get_gateway_status');
  },

  // Runtime
  async getRuntimeStatus(): Promise<RuntimeStatus> {
    return invoke('get_runtime_status');
  },

  async installRuntime(): Promise<void> {
    return invoke('install_runtime');
  },

  async isRuntimeInstalled(): Promise<boolean> {
    return invoke('is_runtime_installed');
  },

  async needsRuntimeUpgrade(): Promise<boolean> {
    return invoke('needs_runtime_upgrade');
  },

  // Activity Log
  async getActivityLog(): Promise<ActivityLogEntry[]> {
    return invoke('get_activity_log');
  },

  async clearActivityLog(): Promise<void> {
    return invoke('clear_activity_log');
  },

  async addActivityEntry(
    operationType: ActivityLogEntry['operationType'],
    details: string,
    status: ActivityLogEntry['status'],
    path?: string
  ): Promise<void> {
    return invoke('add_activity_entry', {
      operationType,
      details,
      status,
      path: path || null,
    });
  },
};
