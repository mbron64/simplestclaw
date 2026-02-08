import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useAppStore } from '../lib/store';
import { GeneralTab } from './settings/GeneralTab';
import { SecurityTab } from './settings/SecurityTab';

type SettingsTab = 'general' | 'security';

export function SettingsPanel() {
  const { setScreen } = useAppStore();
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');

  return (
    <div className="flex flex-col h-screen bg-[#0a0a0a] text-[#fafafa] antialiased">
      {/* Header */}
      <header className="flex items-center gap-4 px-6 h-14 border-b border-white/5">
        <button
          onClick={() => setScreen('chat')}
          className="flex items-center gap-2 text-[13px] text-white/40 hover:text-white/70 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <div className="h-4 w-px bg-white/10" />
        <span className="text-[15px] font-medium tracking-tight">Settings</span>
      </header>

      {/* Tab Navigation */}
      <div className="flex px-6 border-b border-white/5">
        <button
          onClick={() => setActiveTab('general')}
          className={`px-4 py-3 text-[14px] font-medium border-b-2 transition-colors ${
            activeTab === 'general'
              ? 'text-white border-white'
              : 'text-white/40 border-transparent hover:text-white/60'
          }`}
        >
          General
        </button>
        <button
          onClick={() => setActiveTab('security')}
          className={`px-4 py-3 text-[14px] font-medium border-b-2 transition-colors ${
            activeTab === 'security'
              ? 'text-white border-white'
              : 'text-white/40 border-transparent hover:text-white/60'
          }`}
        >
          Security & Activity
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        {activeTab === 'general' && <GeneralTab />}
        {activeTab === 'security' && <SecurityTab />}
      </div>
    </div>
  );
}
