import { useEffect } from 'react';
import { Trash2, ExternalLink, FileText, Terminal, Zap, Shield, RefreshCw } from 'lucide-react';
import { useAppStore, type ActivityLogEntry } from '../../lib/store';
import { tauri } from '../../lib/tauri';

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

export function SecurityTab() {
  const { activityLog, clearActivityLog, setActivityLog } = useAppStore();

  // Load activity log from backend on mount
  useEffect(() => {
    const loadActivityLog = async () => {
      try {
        const entries = await tauri.getActivityLog();
        if (entries && entries.length > 0) {
          setActivityLog(entries);
        }
      } catch (err) {
        // Activity log commands may not be implemented yet
        console.log('Activity log not available:', err);
      }
    };
    loadActivityLog();
  }, [setActivityLog]);

  const handleClearLog = async () => {
    try {
      await tauri.clearActivityLog();
    } catch (err) {
      // Ignore if not implemented
    }
    clearActivityLog();
  };

  const handleOpenPrivacySettings = () => {
    // Open macOS Privacy & Security settings
    window.open('x-apple.systempreferences:com.apple.preference.security?Privacy', '_blank');
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="space-y-8">
        {/* Permissions Section */}
        <section>
          <h2 className="text-[15px] font-medium mb-1">Permissions</h2>
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
                          <p className="text-[12px] text-white/30 font-mono mt-1 truncate" title={entry.path}>
                            {entry.path}
                          </p>
                        )}
                        <span className={`inline-block mt-2 px-2 py-0.5 rounded text-[11px] font-medium ${getStatusBg(entry.status)} ${getStatusColor(entry.status)}`}>
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
            Showing last {Math.min(activityLog.length, 500)} entries. Older entries are automatically removed.
          </p>
        </section>
      </div>
    </div>
  );
}
