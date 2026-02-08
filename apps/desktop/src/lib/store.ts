import { create } from 'zustand';

export type AppScreen = 'loading' | 'onboarding' | 'chat' | 'settings';

export interface GatewayInfo {
  url: string;
  port: number;
  token: string;
}

export type GatewayStatus =
  | { type: 'stopped' }
  | { type: 'starting' }
  | { type: 'running'; info: GatewayInfo }
  | { type: 'error'; message: string };

export type RuntimeStatus =
  | { type: 'checking' }
  | { type: 'downloading'; progress: number }
  | { type: 'installed'; version: string }
  | { type: 'error'; message: string };

export interface ActivityLogEntry {
  id: string;
  timestamp: number;
  operationType: 'file_read' | 'file_write' | 'command' | 'api_call' | 'gateway' | 'permission';
  details: string;
  status: 'success' | 'failed' | 'blocked' | 'pending';
  path?: string;
}

interface AppState {
  screen: AppScreen;
  gatewayStatus: GatewayStatus;
  runtimeStatus: RuntimeStatus;
  apiKeyConfigured: boolean;
  error: string | null;
  activityLog: ActivityLogEntry[];

  setScreen: (screen: AppScreen) => void;
  setGatewayStatus: (status: GatewayStatus) => void;
  setRuntimeStatus: (status: RuntimeStatus) => void;
  setApiKeyConfigured: (configured: boolean) => void;
  setError: (error: string | null) => void;
  addActivityLog: (entry: Omit<ActivityLogEntry, 'id' | 'timestamp'>) => void;
  setActivityLog: (entries: ActivityLogEntry[]) => void;
  clearActivityLog: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  screen: 'loading',
  gatewayStatus: { type: 'stopped' },
  runtimeStatus: { type: 'checking' },
  apiKeyConfigured: false,
  error: null,
  activityLog: [],

  setScreen: (screen) => set({ screen }),
  setGatewayStatus: (gatewayStatus) => set({ gatewayStatus }),
  setRuntimeStatus: (runtimeStatus) => set({ runtimeStatus }),
  setApiKeyConfigured: (apiKeyConfigured) => set({ apiKeyConfigured }),
  setError: (error) => set({ error }),
  addActivityLog: (entry) => set((state) => ({
    activityLog: [
      {
        ...entry,
        id: `activity-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
      },
      ...state.activityLog,
    ].slice(0, 500), // Keep last 500 entries
  })),
  setActivityLog: (activityLog) => set({ activityLog }),
  clearActivityLog: () => set({ activityLog: [] }),
}));
