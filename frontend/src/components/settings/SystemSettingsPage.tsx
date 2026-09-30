import React, { useState } from 'react';
import {
  HardDrive,
  Sliders,
  User,
  Shield,
  Cpu,
  Code2,
  Bell,
  SlidersHorizontal,
  Lock,
  Globe,
  Key,
  Database,
  Layers,
  CheckCircle2,
  Terminal,
  ExternalLink,
  Users,
  Building,
  Palette,
} from 'lucide-react';
import { StorageSettingsTab } from './StorageSettingsTab';

export type SettingSection =
  | 'appearance'
  | 'storage'
  | 'identity'
  | 'security'
  | 'compute'
  | 'development'
  | 'notifications_admin'
  | 'advanced'
  | 'profile'
  | 'preferences'
  | 'developer'
  | 'linked_accounts'
  | 'user_notifications';

interface SystemSettingsPageProps {
  initialTab?: SettingSection;
}

export function SystemSettingsPage({ initialTab = 'profile' }: SystemSettingsPageProps) {
  const [activeTab, setActiveTab] = useState<SettingSection>(initialTab);

  // Helper for rendering secondary sidebar buttons
  const navItem = (id: SettingSection, label: string) => {
    const isActive = activeTab === id;
    return (
      <button
        key={id}
        type="button"
        onClick={() => setActiveTab(id)}
        className={`flex w-full items-center text-left px-3 py-1.5 text-xs rounded-md transition-colors ${
          isActive
            ? 'bg-gray-100 text-gray-900 font-medium'
            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
        }`}
      >
        <span>{label}</span>
      </button>
    );
  };

  return (
    <div className="flex h-full w-full overflow-hidden bg-white">
      {/* Secondary Settings Sidebar */}
      <aside className="w-56 shrink-0 border-r border-gray-200 bg-white p-3 flex flex-col h-full overflow-y-auto select-none">
        {/* Settings Title */}
        <div className="px-3 pt-2 pb-4">
          <h2 className="text-lg font-semibold text-gray-900 tracking-tight">Settings</h2>
        </div>

        <div className="space-y-6 flex-1">
          {/* Group 1: Workspace admin */}
          <div>
            <div className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-gray-500">
              <Sliders className="h-3.5 w-3.5 text-gray-400" />
              <span>Workspace admin</span>
            </div>
            <nav className="mt-1 space-y-0.5">
              {navItem('storage', 'Storage & Volumes')}
              {navItem('appearance', 'Appearance')}
              {navItem('identity', 'Identity and access')}
              {navItem('security', 'Security')}
              {navItem('compute', 'Compute')}
              {navItem('development', 'Development')}
              {navItem('notifications_admin', 'Notifications')}
              {navItem('advanced', 'Advanced')}
            </nav>
          </div>

          {/* Group 2: User */}
          <div>
            <div className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-gray-500">
              <User className="h-3.5 w-3.5 text-gray-400" />
              <span>User</span>
            </div>
            <nav className="mt-1 space-y-0.5">
              {navItem('profile', 'Profile')}
              {navItem('preferences', 'Preferences')}
              {navItem('developer', 'Developer')}
              {navItem('linked_accounts', 'Linked accounts')}
              {navItem('user_notifications', 'Notifications')}
            </nav>
          </div>
        </div>
      </aside>

      {/* Main Surface Content Area */}
      <main className="flex-1 overflow-y-auto p-8 sm:p-10 bg-white">
        <div className="max-w-4xl">
          {/* 1. Storage & Volumes */}
          {activeTab === 'storage' && (
            <div>
              <div className="mb-6 border-b border-gray-100 pb-4">
                <h1 className="text-xl font-semibold text-gray-900">Storage & Volumes</h1>
                <p className="text-xs text-gray-500 mt-1">
                  Manage external storage catalogs, schemas, and blob volumes for CompassX EAM
                </p>
              </div>
              <StorageSettingsTab />
            </div>
          )}

          {/* 2. Appearance */}
          {activeTab === 'appearance' && (
            <div>
              <div className="mb-6 border-b border-gray-100 pb-4">
                <h1 className="text-xl font-semibold text-gray-900">Appearance</h1>
                <p className="text-xs text-gray-500 mt-1">
                  Configure default theme and UI display rules for all workspace members
                </p>
              </div>

              <div className="space-y-0">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 py-5 border-b border-gray-100 items-start">
                  <div className="md:col-span-4">
                    <h4 className="text-xs font-semibold text-gray-900">Workspace Theme</h4>
                    <p className="text-[11px] text-gray-500 mt-0.5">Global UI visual palette</p>
                  </div>
                  <div className="md:col-span-8">
                    <span className="rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-800">
                      Clean Light (Databricks Studio Standard)
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 py-5 border-b border-gray-100 items-start">
                  <div className="md:col-span-4">
                    <h4 className="text-xs font-semibold text-gray-900">Sidebar Layout</h4>
                    <p className="text-[11px] text-gray-500 mt-0.5">Primary navigation bar mode</p>
                  </div>
                  <div className="md:col-span-8">
                    <span className="text-xs font-mono text-gray-800 font-medium">
                      Collapsible 56px / 224px with Progressive Disclosure
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 3. Identity & Access */}
          {activeTab === 'identity' && (
            <div>
              <div className="mb-6 border-b border-gray-100 pb-4">
                <h1 className="text-xl font-semibold text-gray-900">Identity and access</h1>
                <p className="text-xs text-gray-500 mt-1">
                  Manage workspace users, enterprise groups, and role-based assignments
                </p>
              </div>

              <div className="space-y-0">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 py-5 border-b border-gray-100 items-start">
                  <div className="md:col-span-4">
                    <h4 className="text-xs font-semibold text-gray-900">User directory</h4>
                    <p className="text-[11px] text-gray-500 mt-0.5">Active enterprise accounts in this tenant</p>
                  </div>
                  <div className="md:col-span-8 flex flex-wrap gap-2">
                    {['admin@compassx.io', 'vishalkumar.vora@jsw.in', 'alice.safety@compassx.io', 'bob.supervisor@compassx.io', 'charlie.tech@compassx.io'].map((u) => (
                      <span key={u} className="rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-mono text-gray-700">
                        {u}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 py-5 border-b border-gray-100 items-start">
                  <div className="md:col-span-4">
                    <h4 className="text-xs font-semibold text-gray-900">Workflow roles</h4>
                    <p className="text-[11px] text-gray-500 mt-0.5">Configured roles for stage transitions and signatures</p>
                  </div>
                  <div className="md:col-span-8 flex flex-wrap gap-2">
                    {['Administrator', 'Safety Officer', 'Supervisor', 'Technician', 'Engineer'].map((r) => (
                      <span key={r} className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-800 shadow-xs">
                        {r}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 py-5 border-b border-gray-100 items-start">
                  <div className="md:col-span-4">
                    <h4 className="text-xs font-semibold text-gray-900">Single Sign-On (SSO)</h4>
                    <p className="text-[11px] text-gray-500 mt-0.5">Federated enterprise identity provider</p>
                  </div>
                  <div className="md:col-span-8">
                    <div className="flex items-center gap-2 text-xs text-gray-700">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      <span className="font-medium">OIDC / SAML 2.0 Integration Active</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 4. Security */}
          {activeTab === 'security' && (
            <div>
              <div className="mb-6 border-b border-gray-100 pb-4">
                <h1 className="text-xl font-semibold text-gray-900">Security</h1>
                <p className="text-xs text-gray-500 mt-1">
                  Workspace token encryption, session expiration, and authentication headers
                </p>
              </div>

              <div className="space-y-0">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 py-5 border-b border-gray-100 items-start">
                  <div className="md:col-span-4">
                    <h4 className="text-xs font-semibold text-gray-900">Authentication Protocol</h4>
                    <p className="text-[11px] text-gray-500 mt-0.5">JWT token authorization algorithm</p>
                  </div>
                  <div className="md:col-span-8">
                    <span className="rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1 font-mono text-xs text-gray-900 font-semibold">
                      Bearer JWT (HS256)
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 py-5 border-b border-gray-100 items-start">
                  <div className="md:col-span-4">
                    <h4 className="text-xs font-semibold text-gray-900">Session Expiration</h4>
                    <p className="text-[11px] text-gray-500 mt-0.5">Time before re-authentication is required</p>
                  </div>
                  <div className="md:col-span-8">
                    <span className="text-xs font-mono text-gray-800 font-medium">
                      24 Hours (1440 minutes)
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 py-5 border-b border-gray-100 items-start">
                  <div className="md:col-span-4">
                    <h4 className="text-xs font-semibold text-gray-900">CORS Allowed Origins</h4>
                    <p className="text-[11px] text-gray-500 mt-0.5">Cross-origin resource sharing policy</p>
                  </div>
                  <div className="md:col-span-8">
                    <span className="rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1 font-mono text-xs text-gray-700">
                      * (Allowed Origins Configured)
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 5. Compute & Engine */}
          {activeTab === 'compute' && (
            <div>
              <div className="mb-6 border-b border-gray-100 pb-4">
                <h1 className="text-xl font-semibold text-gray-900">Compute</h1>
                <p className="text-xs text-gray-500 mt-1">
                  Event-sourced workflow runners, auto-expiry workers, and database connection pools
                </p>
              </div>

              <div className="space-y-0">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 py-5 border-b border-gray-100 items-start">
                  <div className="md:col-span-4">
                    <h4 className="text-xs font-semibold text-gray-900">Workflow Versioning Strategy</h4>
                    <p className="text-[11px] text-gray-500 mt-0.5">Execution isolation across active definitions</p>
                  </div>
                  <div className="md:col-span-8">
                    <span className="rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1 font-mono text-xs font-bold text-gray-900">
                      Multi-Version Coexistence (V2)
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 py-5 border-b border-gray-100 items-start">
                  <div className="md:col-span-4">
                    <h4 className="text-xs font-semibold text-gray-900">Auto-Expiry Worker</h4>
                    <p className="text-[11px] text-gray-500 mt-0.5">Background polling interval for expired permits</p>
                  </div>
                  <div className="md:col-span-8">
                    <span className="text-xs font-mono text-gray-800">5 seconds interval</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 py-5 border-b border-gray-100 items-start">
                  <div className="md:col-span-4">
                    <h4 className="text-xs font-semibold text-gray-900">Escalation Engine Watchdog</h4>
                    <p className="text-[11px] text-gray-500 mt-0.5">SLA monitors and automatic status transitions</p>
                  </div>
                  <div className="md:col-span-8 flex items-center gap-2">
                    <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
                    <span className="text-xs font-medium text-emerald-700">Active & Running</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 py-5 border-b border-gray-100 items-start">
                  <div className="md:col-span-4">
                    <h4 className="text-xs font-semibold text-gray-900">Database Connection Pool</h4>
                    <p className="text-[11px] text-gray-500 mt-0.5">Underlying relational storage engine</p>
                  </div>
                  <div className="md:col-span-8">
                    <span className="text-xs font-mono text-gray-800">PostgreSQL / SQLAlchemy 2.0 (Pool size: 20)</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 6. Development */}
          {activeTab === 'development' && (
            <div>
              <div className="mb-6 border-b border-gray-100 pb-4">
                <h1 className="text-xl font-semibold text-gray-900">Development</h1>
                <p className="text-xs text-gray-500 mt-1">
                  API endpoints, test fixtures, and schema definitions for workspace customization
                </p>
              </div>

              <div className="space-y-0">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 py-5 border-b border-gray-100 items-start">
                  <div className="md:col-span-4">
                    <h4 className="text-xs font-semibold text-gray-900">API Prefix</h4>
                    <p className="text-[11px] text-gray-500 mt-0.5">Root path for REST API services</p>
                  </div>
                  <div className="md:col-span-8">
                    <span className="rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1 font-mono text-xs text-gray-800">
                      /api
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 py-5 border-b border-gray-100 items-start">
                  <div className="md:col-span-4">
                    <h4 className="text-xs font-semibold text-gray-900">MCP Protocol Server</h4>
                    <p className="text-[11px] text-gray-500 mt-0.5">Model Context Protocol server for AI coding agent pairs</p>
                  </div>
                  <div className="md:col-span-8">
                    <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                      15 Tools Active & Registered
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 7. Notifications Admin */}
          {activeTab === 'notifications_admin' && (
            <div>
              <div className="mb-6 border-b border-gray-100 pb-4">
                <h1 className="text-xl font-semibold text-gray-900">Notifications</h1>
                <p className="text-xs text-gray-500 mt-1">
                  Workspace notification dispatch rules and event subscriptions
                </p>
              </div>

              <div className="space-y-0">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 py-5 border-b border-gray-100 items-start">
                  <div className="md:col-span-4">
                    <h4 className="text-xs font-semibold text-gray-900">In-App Notification Center</h4>
                    <p className="text-[11px] text-gray-500 mt-0.5">Top-header bell dropdown alerts</p>
                  </div>
                  <div className="md:col-span-8">
                    <span className="text-xs font-medium text-emerald-700">Enabled (Polling every 10s)</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 py-5 border-b border-gray-100 items-start">
                  <div className="md:col-span-4">
                    <h4 className="text-xs font-semibold text-gray-900">Escalation Alert Channels</h4>
                    <p className="text-[11px] text-gray-500 mt-0.5">Channels receiving critical SLA breaches</p>
                  </div>
                  <div className="md:col-span-8 flex gap-2">
                    <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-700">In-App Banner</span>
                    <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-700">Audit Stream</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 8. Advanced */}
          {activeTab === 'advanced' && (
            <div>
              <div className="mb-6 border-b border-gray-100 pb-4">
                <h1 className="text-xl font-semibold text-gray-900">Advanced</h1>
                <p className="text-xs text-gray-500 mt-1">
                  System diagnostics, cache eviction, and infrastructure parameters
                </p>
              </div>

              <div className="space-y-0">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 py-5 border-b border-gray-100 items-start">
                  <div className="md:col-span-4">
                    <h4 className="text-xs font-semibold text-gray-900">Storage Mode</h4>
                    <p className="text-[11px] text-gray-500 mt-0.5">Active CompassX storage mode</p>
                  </div>
                  <div className="md:col-span-8">
                    <span className="font-mono text-xs text-gray-800">live (Direct cloud blob storage)</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 py-5 border-b border-gray-100 items-start">
                  <div className="md:col-span-4">
                    <h4 className="text-xs font-semibold text-gray-900">System Environment</h4>
                    <p className="text-[11px] text-gray-500 mt-0.5">Runtime deployment environment</p>
                  </div>
                  <div className="md:col-span-8">
                    <span className="font-mono text-xs text-gray-800">ENGD-INC-IP-ADB-01 (Production)</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 9. User Profile (matches exact screenshot!) */}
          {activeTab === 'profile' && (
            <div>
              <div className="mb-6 border-b border-gray-100 pb-4">
                <h1 className="text-xl font-semibold text-gray-900">Profile</h1>
                <p className="text-xs text-gray-500 mt-1">Manage your Databricks profile</p>
              </div>

              <div className="space-y-0">
                {/* Display name */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 py-5 border-b border-gray-100 items-start">
                  <div className="md:col-span-4">
                    <h4 className="text-xs font-semibold text-gray-900">Display name</h4>
                    <p className="text-[11px] text-gray-500 mt-0.5">Your display name</p>
                  </div>
                  <div className="md:col-span-8">
                    <span className="text-xs font-medium text-gray-900">
                      Vishalkumar Vora (vishalkumar.vora@jsw.in)
                    </span>
                  </div>
                </div>

                {/* Groups */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 py-5 border-b border-gray-100 items-start">
                  <div className="md:col-span-4">
                    <h4 className="text-xs font-semibold text-gray-900">Groups</h4>
                    <p className="text-[11px] text-gray-500 mt-0.5">Your group memberships</p>
                  </div>
                  <div className="md:col-span-8 flex flex-wrap gap-1.5">
                    {[
                      'admins',
                      'Data Engineering',
                      'Data Science Team',
                      'DE_Read',
                      'DE_Write',
                      'Development_team',
                      'users',
                      'users-clone-2026-08-05-1613-UTC',
                    ].map((grp) => (
                      <span
                        key={grp}
                        className="rounded bg-gray-100 px-2 py-0.5 text-[11px] font-mono text-gray-700"
                      >
                        {grp}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 10. Preferences */}
          {activeTab === 'preferences' && (
            <div>
              <div className="mb-6 border-b border-gray-100 pb-4">
                <h1 className="text-xl font-semibold text-gray-900">Preferences</h1>
                <p className="text-xs text-gray-500 mt-1">Customize your workspace appearance and behavior</p>
              </div>

              <div className="space-y-0">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 py-5 border-b border-gray-100 items-start">
                  <div className="md:col-span-4">
                    <h4 className="text-xs font-semibold text-gray-900">Theme</h4>
                    <p className="text-[11px] text-gray-500 mt-0.5">Visual interface appearance</p>
                  </div>
                  <div className="md:col-span-8">
                    <span className="rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-800">
                      Clean Slate (System Light)
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 py-5 border-b border-gray-100 items-start">
                  <div className="md:col-span-4">
                    <h4 className="text-xs font-semibold text-gray-900">Layout Density</h4>
                    <p className="text-[11px] text-gray-500 mt-0.5">Compact tables and progressive disclosure sidebars</p>
                  </div>
                  <div className="md:col-span-8">
                    <span className="text-xs text-gray-700">Compact / Progressive Disclosure</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 11. Developer */}
          {activeTab === 'developer' && (
            <div>
              <div className="mb-6 border-b border-gray-100 pb-4">
                <h1 className="text-xl font-semibold text-gray-900">Developer</h1>
                <p className="text-xs text-gray-500 mt-1">Personal access tokens and developer tools</p>
              </div>

              <div className="space-y-0">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 py-5 border-b border-gray-100 items-start">
                  <div className="md:col-span-4">
                    <h4 className="text-xs font-semibold text-gray-900">API Access Token</h4>
                    <p className="text-[11px] text-gray-500 mt-0.5">Scoped token for CLI & programmatic integrations</p>
                  </div>
                  <div className="md:col-span-8 flex items-center gap-3">
                    <span className="rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 font-mono text-xs text-gray-600">
                      ••••••••••••••••••••••••••••
                    </span>
                    <button
                      type="button"
                      className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 shadow-xs"
                    >
                      Generate Token
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 12. Linked accounts */}
          {activeTab === 'linked_accounts' && (
            <div>
              <div className="mb-6 border-b border-gray-100 pb-4">
                <h1 className="text-xl font-semibold text-gray-900">Linked accounts</h1>
                <p className="text-xs text-gray-500 mt-1">Connected cloud providers and external identity credentials</p>
              </div>

              <div className="space-y-0">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 py-5 border-b border-gray-100 items-start">
                  <div className="md:col-span-4">
                    <h4 className="text-xs font-semibold text-gray-900">Cloud Provider</h4>
                    <p className="text-[11px] text-gray-500 mt-0.5">Connected Microsoft Azure tenant</p>
                  </div>
                  <div className="md:col-span-8 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span className="text-xs font-medium text-gray-800">Microsoft Azure (Connected)</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 13. User Notifications */}
          {activeTab === 'user_notifications' && (
            <div>
              <div className="mb-6 border-b border-gray-100 pb-4">
                <h1 className="text-xl font-semibold text-gray-900">Notifications</h1>
                <p className="text-xs text-gray-500 mt-1">Manage your email and in-app alerts</p>
              </div>

              <div className="space-y-0">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 py-5 border-b border-gray-100 items-start">
                  <div className="md:col-span-4">
                    <h4 className="text-xs font-semibold text-gray-900">Email Notifications</h4>
                    <p className="text-[11px] text-gray-500 mt-0.5">Workflow approval requests and assignment alerts</p>
                  </div>
                  <div className="md:col-span-8">
                    <span className="text-xs font-medium text-emerald-700">Enabled for vishalkumar.vora@jsw.in</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default SystemSettingsPage;
