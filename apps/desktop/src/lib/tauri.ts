import { invoke } from '@tauri-apps/api/core';
import type { ActivityLogEntry, GatewayInfo } from './store';

export type Provider = 'anthropic' | 'openai' | 'google' | 'openrouter';
export type ApiMode = 'byo' | 'managed';

export interface Config {
  provider: Provider;
  anthropicApiKey: string | null;
  gatewayPort: number;
  autoStartGateway: boolean;
  apiMode: ApiMode;
  licenseKey: string | null;
  userEmail: string | null;
  selectedModel: string | null;
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

export interface AppDataInfo {
  configPath: string | null;
  dataPath: string | null;
  totalSizeBytes: number;
  totalSizeFormatted: string;
}

export const tauri = {
  // Config
  async getConfig(): Promise<Config> {
    return invoke('get_config');
  },

  async setApiKey(key: string): Promise<void> {
    return invoke('set_api_key', { key });
  },

  async setProvider(provider: Provider): Promise<void> {
    return invoke('set_provider', { provider });
  },

  async hasApiKey(): Promise<boolean> {
    return invoke('has_api_key');
  },

  // API Mode (managed vs BYO)
  async getApiMode(): Promise<ApiMode> {
    return invoke('get_api_mode') as Promise<ApiMode>;
  },

  async setApiMode(mode: ApiMode): Promise<void> {
    return invoke('set_api_mode', { mode });
  },

  async setLicenseKey(key: string): Promise<void> {
    return invoke('set_license_key', { key });
  },

  async setUserEmail(email: string): Promise<void> {
    return invoke('set_user_email', { email });
  },

  async setSelectedModel(model: string): Promise<void> {
    return invoke('set_selected_model', { model });
  },

  // Gateway
  async startGateway(): Promise<GatewayInfo> {
    return invoke('start_gateway');
  },

  async stopGateway(): Promise<void> {
    return invoke('stop_gateway');
  },

  async getGatewayStatus(): Promise<{
    running: boolean;
    info: GatewayInfo | null;
    error: string | null;
  }> {
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

  // App Data Management
  async getAppDataInfo(): Promise<AppDataInfo> {
    return invoke('get_app_data_info');
  },

  async deleteAllAppData(): Promise<void> {
    return invoke('delete_all_app_data');
  },
};
