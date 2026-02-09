import { AlertCircle, Check, Download, Loader2 } from 'lucide-react';
import { useAppStore } from '../lib/store';
import { TextShimmer } from './ui/text-shimmer';

type LoadingPhase = 'checking' | 'downloading' | 'starting' | 'ready' | 'error' | 'gateway-error';
type StepStatus = 'pending' | 'active' | 'complete';

// Loading step with check or spinner
function LoadingStep({ label, status }: { label: string; status: StepStatus }) {
  const getIcon = () => {
    if (status === 'complete') return <Check className="w-4 h-4 text-green-400" />;
    if (status === 'active') return <Loader2 className="w-4 h-4 text-white/60 animate-spin" />;
    return <div className="w-4 h-4 rounded-full border border-white/20" />;
  };

  const getTextStyle = () => {
    if (status === 'complete') return 'text-white/60';
    if (status === 'active') return 'text-white/80';
    return 'text-white/30';
  };

  return (
    <div className="flex items-center gap-3">
      {getIcon()}
      <span className={`text-[13px] ${getTextStyle()}`}>{label}</span>
    </div>
  );
}

// Error display component
function ErrorDisplay({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-[#0a0a0a] text-[#fafafa] antialiased">
      <div className="flex flex-col items-center space-y-4 max-w-md px-8">
        <AlertCircle className="w-8 h-8 text-red-400" />
        <p className="text-[15px] text-white/80 font-medium">{title}</p>
        <p className="text-[13px] text-white/40 text-center">{message}</p>
      </div>
    </div>
  );
}

// Phase text mapping
const PHASE_TEXT: Record<LoadingPhase, string> = {
  checking: 'Checking system requirements...',
  downloading: 'Downloading Node.js runtime...',
  starting: 'Starting AI gateway...',
  ready: 'Ready!',
  error: 'Setup failed',
  'gateway-error': 'Connection failed',
};

export function Loading() {
  const { runtimeStatus, gatewayStatus } = useAppStore();

  // Determine phase from status
  const phase = getLoadingPhase(runtimeStatus.type, gatewayStatus.type);

  // Handle error states
  if (phase === 'error') {
    return <ErrorDisplay title="Setup failed" message={runtimeStatus.message || 'Unknown error'} />;
  }

  if (phase === 'gateway-error') {
    const errorMsg =
      gatewayStatus.type === 'error' ? gatewayStatus.message : 'Failed to start gateway';
    return <ErrorDisplay title="Connection failed" message={errorMsg} />;
  }

  // Calculate progress
  const progress = calculateProgress(phase, runtimeStatus);

  // Get step statuses
  const runtimeStep = getRuntimeStepStatus(runtimeStatus.type);
  const gatewayStep = getGatewayStepStatus(runtimeStatus.type, gatewayStatus.type);
  const connectStep = getConnectStepStatus(gatewayStatus.type);

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-[#0a0a0a] text-[#fafafa] antialiased">
      <div className="flex flex-col items-center space-y-6 max-w-md px-8">
        {/* Logo/Icon */}
        <div className="w-16 h-16 rounded-2xl bg-white/[0.02] border border-white/10 flex items-center justify-center mb-2">
          {phase === 'downloading' ? (
            <Download className="w-8 h-8 text-blue-400 animate-pulse" />
          ) : (
            <Loader2 className="w-8 h-8 text-white/40 animate-spin" />
          )}
        </div>

        {/* Shimmer text - main status */}
        <TextShimmer
          className="text-[17px] font-medium [--base-color:theme(colors.zinc.500)] [--base-gradient-color:theme(colors.white)]"
          duration={1.5}
        >
          {PHASE_TEXT[phase]}
        </TextShimmer>

        {/* Progress bar */}
        <div className="w-72 space-y-2">
          <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Download percentage */}
          {phase === 'downloading' && (
            <p className="text-[12px] text-white/40 text-center">
              {Math.round(runtimeStatus.progress)}% complete
            </p>
          )}
        </div>

        {/* Loading steps */}
        <div className="space-y-2 mt-4">
          <LoadingStep label="Check runtime" status={runtimeStep} />
          <LoadingStep label="Start AI gateway" status={gatewayStep} />
          <LoadingStep label="Connect" status={connectStep} />
        </div>

        {/* First-time download notice */}
        {phase === 'downloading' && (
          <p className="text-[11px] text-white/30 text-center mt-4">
            First-time setup: downloading Node.js runtime (~45MB)
            <br />
            This only happens once.
          </p>
        )}

        {/* Starting gateway notice */}
        {phase === 'starting' && (
          <p className="text-[11px] text-white/30 text-center mt-2">
            Initializing AI connection...
          </p>
        )}
      </div>
    </div>
  );
}

// Helper: Determine loading phase from statuses
function getLoadingPhase(runtimeType: string, gatewayType: string): LoadingPhase {
  if (runtimeType === 'checking') return 'checking';
  if (runtimeType === 'downloading') return 'downloading';
  if (runtimeType === 'error') return 'error';

  if (runtimeType === 'installed') {
    if (gatewayType === 'running') return 'ready';
    if (gatewayType === 'error') return 'gateway-error';
    return 'starting';
  }

  return 'checking';
}

// Helper: Calculate progress percentage
function calculateProgress(
  phase: LoadingPhase,
  runtimeStatus: { type: string; progress?: number }
): number {
  if (phase === 'downloading') {
    return Math.round((runtimeStatus.progress || 0) * 0.5);
  }
  if (phase === 'checking') return 5;
  if (phase === 'starting') return 70;
  if (phase === 'ready') return 100;
  return 0;
}

// Helper: Get runtime step status
function getRuntimeStepStatus(runtimeType: string): StepStatus {
  if (runtimeType === 'installed') return 'complete';
  if (runtimeType === 'checking' || runtimeType === 'downloading') return 'active';
  return 'pending';
}

// Helper: Get gateway step status
function getGatewayStepStatus(runtimeType: string, gatewayType: string): StepStatus {
  if (gatewayType === 'running') return 'complete';
  const isRuntimeReady = runtimeType === 'installed';
  const isGatewayStarting = gatewayType === 'starting' || gatewayType === 'stopped';
  if (isRuntimeReady && isGatewayStarting) return 'active';
  return 'pending';
}

// Helper: Get connect step status
function getConnectStepStatus(gatewayType: string): StepStatus {
  return gatewayType === 'running' ? 'complete' : 'pending';
}
