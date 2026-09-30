import React, { useState } from 'react';
import {
  Search,
  Sparkles,
  Grid,
  ChevronDown,
  Layers,
  Bell,
  Check,
  ExternalLink,
} from 'lucide-react';

interface TopHeaderProps {
  onSearchClick?: () => void;
}

export const TopHeader: React.FC<TopHeaderProps> = ({ onSearchClick }) => {
  const [envMenuOpen, setEnvMenuOpen] = useState(false);
  const [selectedEnv, setSelectedEnv] = useState('ENGD-INC-IP-ADB-01');

  const environments = [
    { id: 'ENGD-INC-IP-ADB-01', label: 'ENGD-INC-IP-ADB-01 (Production)' },
    { id: 'STAGING-EAM-02', label: 'STAGING-EAM-02 (Staging)' },
    { id: 'DEV-WORKFLOW-01', label: 'DEV-WORKFLOW-01 (Development)' },
  ];

  return (
    <header className="flex h-11 w-full shrink-0 items-center justify-between border-b border-gray-200 bg-white px-3.5 select-none z-30">
      {/* Left: App Brand & Azure/CompassX Logo */}
      <div className="flex items-center gap-2.5">
        <div className="flex items-center gap-2">
          {/* Azure / Cloud Icon Badge */}
          <div className="flex h-6 w-6 items-center justify-center rounded border border-gray-200 bg-slate-50 text-sky-600">
            <Layers className="h-3.5 w-3.5" />
          </div>
          <span className="text-xs font-semibold text-gray-700 hover:text-gray-900 transition-colors cursor-pointer">
            Microsoft Azure
          </span>
          <span className="text-gray-300 text-xs">/</span>
          {/* CompassX / Databricks Style Logo */}
          <div className="flex items-center gap-1.5 font-bold text-xs tracking-tight text-gray-900">
            <span className="flex h-3.5 w-3.5 items-center justify-center rounded-xs bg-rose-600 text-[9px] font-black text-white">
              C
            </span>
            <span>compass<span className="text-rose-600 font-extrabold">x</span></span>
          </div>
        </div>
      </div>

      {/* Center: Global Search Bar */}
      <div className="flex flex-1 max-w-xl justify-center px-4">
        <button
          type="button"
          onClick={onSearchClick}
          className="flex h-7 w-full max-w-md items-center justify-between rounded-md border border-gray-200 bg-gray-50/80 px-2.5 text-xs text-gray-400 hover:border-gray-300 hover:bg-white hover:text-gray-600 transition-all shadow-2xs"
        >
          <div className="flex items-center gap-2 truncate">
            <Search className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            <span className="truncate text-[11px] text-gray-500">
              Search data, workflows, records, and more...
            </span>
          </div>
          <kbd className="hidden sm:inline-flex items-center rounded border border-gray-200 bg-white px-1.5 py-0.5 font-mono text-[9px] font-semibold text-gray-500 shadow-2xs">
            CTRL + P
          </kbd>
        </button>
      </div>

      {/* Right: Environment selector, Sparkle AI, 9-dot grid, Avatar */}
      <div className="flex items-center gap-2.5">
        {/* Environment Dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setEnvMenuOpen(!envMenuOpen)}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <span className="font-mono text-[11px]">{selectedEnv}</span>
            <ChevronDown className="h-3 w-3 text-gray-400" />
          </button>

          {envMenuOpen && (
            <div className="absolute right-0 mt-1 w-64 rounded-lg border border-gray-200 bg-white py-1 shadow-lg z-50">
              <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 border-b border-gray-100">
                Workspace Environments
              </div>
              {environments.map((env) => (
                <button
                  key={env.id}
                  type="button"
                  onClick={() => {
                    setSelectedEnv(env.id);
                    setEnvMenuOpen(false);
                  }}
                  className="flex w-full items-center justify-between px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 text-left transition-colors"
                >
                  <span className="font-mono text-[11px]">{env.label}</span>
                  {selectedEnv === env.id && (
                    <Check className="h-3.5 w-3.5 text-rose-600" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* AI Assistant Sparkle Button */}
        <button
          type="button"
          title="CompassX AI Assistant"
          className="flex h-7 w-7 items-center justify-center rounded-md text-purple-600 hover:bg-purple-50 transition-colors"
        >
          <Sparkles className="h-4 w-4" />
        </button>

        {/* 9-dot app grid */}
        <button
          type="button"
          title="App Launcher"
          className="flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 transition-colors"
        >
          <Grid className="h-4 w-4" />
        </button>

        {/* User Circle Avatar (Matches Databricks screenshot with initial 'V') */}
        <div
          title="Vishalkumar Vora (vishalkumar.vora@jsw.in)"
          className="flex h-7 w-7 items-center justify-center rounded-full bg-purple-700 text-xs font-bold text-white shadow-2xs cursor-pointer hover:opacity-90"
        >
          V
        </div>
      </div>
    </header>
  );
};
