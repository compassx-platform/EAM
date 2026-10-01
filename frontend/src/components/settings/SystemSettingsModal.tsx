import React, { useState, useEffect } from 'react';
import {
  Settings,
  HardDrive,
  Server,
  Shield,
  X,
  Sliders,
  CheckCircle,
} from 'lucide-react';
import { StorageSettingsTab } from './StorageSettingsTab';

interface SystemSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: 'storage' | 'engine' | 'security';
}

type SettingTab = 'storage' | 'engine' | 'security';

export function SystemSettingsModal({
  isOpen,
  onClose,
  defaultTab = 'storage',
}: SystemSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingTab>(defaultTab);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 md:p-8 animate-in fade-in duration-150">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog Surface */}
      <div className="relative flex h-[90vh] max-h-[720px] w-full max-w-4xl flex-col rounded-2xl border border-gray-200 bg-white shadow-2xl overflow-hidden z-10">
        {/* Header */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-gray-200/80 px-5 bg-gray-50/50">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-900 text-white shadow-xs">
              <Settings className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900 tracking-tight">System Settings</h2>
              <p className="text-[11px] text-gray-500 font-medium">
                Global workspace infrastructure and external storage configuration
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            title="Close settings"
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-200/60 hover:text-gray-700 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content Body with Left Sidebar Tabs */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left Navigation Sidebar */}
          <aside className="w-52 shrink-0 border-r border-gray-200/80 bg-gray-50/70 p-3 flex flex-col justify-between">
            <nav className="space-y-1">
              <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                System Controls
              </div>

              <button
                type="button"
                onClick={() => setActiveTab('storage')}
                className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all ${
                  activeTab === 'storage'
                    ? 'bg-white text-gray-900 shadow-xs border border-gray-200/80 text-blue-700'
                    : 'text-gray-600 hover:bg-white/60 hover:text-gray-900'
                }`}
              >
                <HardDrive className={`h-4 w-4 ${activeTab === 'storage' ? 'text-blue-600' : 'text-gray-500'}`} />
                <span>Document Storage</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('engine')}
                className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all ${
                  activeTab === 'engine'
                    ? 'bg-white text-gray-900 shadow-xs border border-gray-200/80 text-blue-700'
                    : 'text-gray-600 hover:bg-white/60 hover:text-gray-900'
                }`}
              >
                <Server className={`h-4 w-4 ${activeTab === 'engine' ? 'text-blue-600' : 'text-gray-500'}`} />
                <span>Workspace & Engine</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('security')}
                className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all ${
                  activeTab === 'security'
                    ? 'bg-white text-gray-900 shadow-xs border border-gray-200/80 text-blue-700'
                    : 'text-gray-600 hover:bg-white/60 hover:text-gray-900'
                }`}
              >
                <Shield className={`h-4 w-4 ${activeTab === 'security' ? 'text-blue-600' : 'text-gray-500'}`} />
                <span>Access & Security</span>
              </button>
            </nav>

            {/* Bottom Status Info */}
            <div className="rounded-xl border border-gray-200/80 bg-white p-2.5 text-[11px] text-gray-500">
              <span className="block font-bold text-gray-700">CompassX Platform</span>
              <span className="block text-[10px] text-gray-400">Environment: Production / EAM</span>
              <span className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-emerald-600">
                <CheckCircle className="h-3 w-3" /> System Operational
              </span>
            </div>
          </aside>

          {/* Right Main Content Pane */}
          <main className="flex-1 overflow-y-auto p-5 sm:p-6 bg-white">
            {activeTab === 'storage' && <StorageSettingsTab />}

            {activeTab === 'engine' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                    <Server className="h-4 w-4 text-blue-600" />
                    Workflow Engine & Workspace Runtime
                  </h3>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Configuration of event-sourced workflow runners, escalation watchdogs, and background workers.
                  </p>
                </div>

                <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-4 space-y-3 text-xs">
                  <div className="flex items-center justify-between border-b border-gray-200/60 pb-2">
                    <span className="font-semibold text-gray-700">Workflow Versioning Strategy</span>
                    <span className="font-mono text-gray-900 font-bold">Multi-Version Coexistence (V2)</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-gray-200/60 pb-2">
                    <span className="font-semibold text-gray-700">Auto-Expiry Worker Interval</span>
                    <span className="font-mono text-gray-900">5 seconds</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-gray-200/60 pb-2">
                    <span className="font-semibold text-gray-700">Escalation Engine Watchdog</span>
                    <span className="font-mono text-emerald-600 font-semibold">Active & Running</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-gray-700">Database Connection Pool</span>
                    <span className="font-mono text-gray-900">PostgreSQL / SQLAlchemy 2.0</span>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'security' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                    <Shield className="h-4 w-4 text-blue-600" />
                    Access Control & Authentication
                  </h3>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Authentication headers, JWT tokens, and role-based permissions.
                  </p>
                </div>

                <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-4 space-y-3 text-xs">
                  <div className="flex items-center justify-between border-b border-gray-200/60 pb-2">
                    <span className="font-semibold text-gray-700">Authentication Protocol</span>
                    <span className="font-mono text-gray-900 font-bold">Bearer JWT Token</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-gray-200/60 pb-2">
                    <span className="font-semibold text-gray-700">Session Expiration</span>
                    <span className="font-mono text-gray-900">24 Hours (1440 min)</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-gray-700">CORS Allowed Origins</span>
                    <span className="font-mono text-gray-900">* (Configured)</span>
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
