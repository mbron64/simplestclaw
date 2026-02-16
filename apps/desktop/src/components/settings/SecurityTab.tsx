import { Code, ExternalLink, FileText, Lock, MessageSquare, RefreshCw, Shield, Terminal, Trash2, Zap } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { type ActivityLogEntry, useAppStore } from '../../lib/store';
import { type ToolProfile, tauri } from '../../lib/tauri';

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function getOperationIcon(type: ActivityLogEntry['operationType']) {
  switch (type) {
    case 'file_read':
    case 'file_write':
      return <FileText className="w-4 h-4" />;
    case 'command':
      return <Terminal className="w-4 h-4" />;
    case 'api_call':
      return <Zap className="w-4 h-4" />;
    case 'gateway':
      return <RefreshCw className="w-4 h-4" />;
    case 'permission':
      return <Shield className="w-4 h-4" />;
    default:
      return <FileText className="w-4 h-4" />;
  }
}

function getOperationLabel(type: ActivityLogEntry['operationType']): string {
  switch (type) {
    case 'file_read':
      return 'File Read';
    case 'file_write':
      return 'File Write';
    case 'command':
      return 'Command';
    case 'api_call':
      return 'API Call';
    case 'gateway':
      return 'Gateway';
    case 'permission':
      return 'Permission';
    default:
      return type;
  }
}

function getStatusColor(status: ActivityLogEntry['status']): string {
  switch (status) {
    case 'success':
      return 'text-emerald-400';
    case 'failed':
      return 'text-red-400';
    case 'blocked':
      return 'text-yellow-400';
    case 'pending':
      return 'text-white/40';
    default:
      return 'text-white/40';
  }
}

function getStatusBg(status: ActivityLogEntry['status']): string {
  switch (status) {
    case 'success':
      return 'bg-emerald-400/10';
    case 'failed':
      return 'bg-red-400/10';
    case 'blocked':
      return 'bg-yellow-400/10';
    case 'pending':
      return 'bg-white/5';
    default:
      return 'bg-white/5';
  }
}

const ACCESS_LEVELS: { value: ToolProfile; label: string; description: string; icon: React.ReactNode }[] = [
  {
    value: 'full',
    label: 'Full Access',
    description: 'Read, write, and run commands anywhere',
    icon: <Shield className="w-4 h-4" />,
  },
  {
    value: 'coding',
    label: 'Coding Only',
    description: 'File access and shell commands only',
    icon: <Code className="w-4 h-4" />,
  },
  {
    value: 'minimal',
    label: 'Chat Only',
    description: 'Conversation only, no file or system access',
    icon: <MessageSquare className="w-4 h-4" />,
  },
];

export function SecurityTab() {
  const { activityLog, clearActivityLog, setActivityLog, gatewayStatus } = useAppStore();
  const [toolProfile, setToolProfile] = useState<ToolProfile>('full');
  const [allowExec, setAllowExec] = useState(true);
  const [savedProfile, setSavedProfile] = useState<ToolProfile>('full');
  const [savedAllowExec, setSavedAllowExec] = useState(true);
  const [needsRestart, setNeedsRestart] = useState(false);
  const [restarting, setRestarting] = useState(false);

  // Load config on mount
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const config = await tauri.getConfig();
        setToolProfile(config.toolProfile);
        setAllowExec(config.allowExec);
        setSavedProfile(config.toolProfile);
        setSavedAllowExec(config.allowExec);
      } catch (err) {
        console.error('Failed to load config:', err);
      }
    };
    loadConfig();
  }, []);

  // Load activity log from backend on mount
  useEffect(() => {
    const loadActivityLog = async () => {
      try {
        const entries = await tauri.getActivityLog();
        if (entries && entries.length > 0) {
          setActivityLog(entries);
        }
      } catch (err) {
        console.error('Failed to load activity log:', err);
      }
    };
    loadActivityLog();
  }, [setActivityLog]);

  // Track whether we need a restart (settings differ from what was loaded)
  useEffect(() => {
    setNeedsRestart(toolProfile !== savedProfile || allowExec !== savedAllowExec);
  }, [toolProfile, allowExec, savedProfile, savedAllowExec]);

  const handleProfileChange = useCallback(async (profile: ToolProfile) => {
    setToolProfile(profile);
    try {
      await tauri.setToolProfile(profile);
    } catch (err) {
      console.error('Failed to set tool profile:', err);
    }
  }, []);

  const handleExecToggle = useCallback(async () => {
    const newValue = !allowExec;
    setAllowExec(newValue);
    try {
      await tauri.setAllowExec(newValue);
    } catch (err) {
      console.error('Failed to set allow exec:', err);
    }
  }, [allowExec]);

  const handleRestartGateway = useCallback(async () => {
    setRestarting(true);
    try {
      await tauri.stopGateway();
      await new Promise(resolve => setTimeout(resolve, 1000));
      await tauri.startGateway();
      setSavedProfile(toolProfile);
      setSavedAllowExec(allowExec);
      setNeedsRestart(false);
    } catch (err) {
      console.error('Failed to restart gateway:', err);
    } finally {
      setRestarting(false);
    }
  }, [toolProfile, allowExec]);

  const handleClearLog = async () => {
    try {
      await tauri.clearActivityLog();
    } catch (err) {
      console.error('Failed to clear activity log:', err);
    }
    clearActivityLog();
  };

  const handleOpenPrivacySettings = () => {
    window.open('x-apple.systempreferences:com.apple.preference.security?Privacy', '_blank');
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="space-y-8">
        {/* Agent Permissions Section */}
        <section>
          <h2 className="text-[15px] font-medium mb-1">Agent Permissions</h2>
          <p className="text-[13px] text-white/40 mb-4">
            Control what the AI agent can access on your computer.
          </p>

          <div className="space-y-3">
            {/* Access Level Radio Group */}
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/10">
              <p className="text-[13px] text-white/60 mb-3 font-medium">Access Level</p>
              <div className="space-y-2">
                {ACCESS_LEVELS.map((level) => (
                  <button
                    key={level.value}
                    type="button"
                    onClick={() => handleProfileChange(level.value)}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all text-left ${
                      toolProfile === level.value
                        ? 'border-blue-500/40 bg-blue-500/10'
                        : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.04]'
                    }`}
                  >
                    <div className={`p-1.5 rounded-md ${
                      toolProfile === level.value ? 'bg-blue-500/20 text-blue-400' : 'bg-white/5 text-white/40'
                    }`}>
                      {level.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-[13px] font-medium ${
                        toolProfile === level.value ? 'text-white' : 'text-white/70'
                      }`}>
                        {level.label}
                      </p>
                      <p className="text-[12px] text-white/40">{level.description}</p>
                    </div>
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      toolProfile === level.value
                        ? 'border-blue-500 bg-blue-500'
                        : 'border-white/20'
                    }`}>
                      {toolProfile === level.value && (
                        <div className="w-1.5 h-1.5 rounded-full bg-white" />
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Shell Commands Toggle — hidden in Chat Only mode */}
            {toolProfile !== 'minimal' && (
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-1.5 rounded-md ${allowExec ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/5 text-white/40'}`}>
                      <Terminal className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-[13px] font-medium text-white/80">Allow Shell Commands</p>
                      <p className="text-[12px] text-white/40">
                        Let the agent run terminal commands (e.g. npm install, git commit)
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleExecToggle}
                    className={`relative w-10 h-6 rounded-full transition-colors ${
                      allowExec ? 'bg-emerald-500' : 'bg-white/10'
                    }`}
                  >
                    <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                      allowExec ? 'translate-x-5' : 'translate-x-1'
                    }`} />
                  </button>
                </div>
              </div>
            )}

            {/* Restart Banner */}
            {needsRestart && gatewayStatus.type === 'running' && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-amber-400 shrink-0" />
                  <p className="text-[12px] text-amber-300">
                    Restart the gateway for permission changes to take effect.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleRestartGateway}
                  disabled={restarting}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-[12px] font-medium text-amber-300 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${restarting ? 'animate-spin' : ''}`} />
                  {restarting ? 'Restarting...' : 'Restart'}
                </button>
              </div>
            )}
          </div>
        </section>

        {/* System Permissions Section */}
        <section>
          <h2 className="text-[15px] font-medium mb-1">System Permissions</h2>
          <p className="text-[13px] text-white/40 mb-4">
            Manage app permissions in your system settings.
          </p>

          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/10">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[14px] text-white/80">System Preferences</p>
                <p className="text-[12px] text-white/40 mt-1">
                  View and manage file access, automation, and other permissions
                </p>
              </div>
              <button
                type="button"
                onClick={handleOpenPrivacySettings}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-[13px] text-white/60 hover:text-white/80 transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                Open
              </button>
            </div>
          </div>
        </section>

        {/* Activity Log Section */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-[15px] font-medium mb-1">Activity Log</h2>
              <p className="text-[13px] text-white/40">
                Recent operations performed by the AI assistant.
              </p>
            </div>
            {activityLog.length > 0 && (
              <button
                type="button"
                onClick={handleClearLog}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-[13px] text-white/40 hover:text-white/60 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Clear
              </button>
            )}
          </div>

          {activityLog.length === 0 ? (
            <div className="p-8 rounded-xl bg-white/[0.02] border border-white/10 text-center">
              <Shield className="w-8 h-8 text-white/20 mx-auto mb-3" />
              <p className="text-[14px] text-white/40">No activity recorded yet</p>
              <p className="text-[12px] text-white/30 mt-1">
                Operations will appear here as you use the app
              </p>
            </div>
          ) : (
            <div className="rounded-xl bg-white/[0.02] border border-white/10 overflow-hidden">
              <div className="max-h-[400px] overflow-y-auto">
                {activityLog.map((entry, index) => (
                  <div
                    key={entry.id}
                    className={`p-4 ${index !== activityLog.length - 1 ? 'border-b border-white/5' : ''}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg ${getStatusBg(entry.status)}`}>
                        <span className={getStatusColor(entry.status)}>
                          {getOperationIcon(entry.operationType)}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[14px] font-medium text-white/80">
                            {getOperationLabel(entry.operationType)}
                          </span>
                          <span className="text-[12px] text-white/30 font-mono">
                            {formatTimestamp(entry.timestamp)}
                          </span>
                        </div>
                        <p className="text-[13px] text-white/50 mt-1 break-words">
                          {entry.details}
                        </p>
                        {entry.path && (
                          <p
                            className="text-[12px] text-white/30 font-mono mt-1 truncate"
                            title={entry.path}
                          >
                            {entry.path}
                          </p>
                        )}
                        <span
                          className={`inline-block mt-2 px-2 py-0.5 rounded text-[11px] font-medium ${getStatusBg(entry.status)} ${getStatusColor(entry.status)}`}
                        >
                          {entry.status.charAt(0).toUpperCase() + entry.status.slice(1)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="mt-3 text-[12px] text-white/30">
            Showing last {Math.min(activityLog.length, 500)} entries. Older entries are
            automatically removed.
          </p>
        </section>
      </div>
    </div>
  );
}
