import React from 'react';
import {
  LayoutDashboard,
  ClipboardList,
  FileCheck2,
  Workflow,
  Sliders,
  ShieldCheck,
  History,
  Users,
} from 'lucide-react';
import { CompassXLogo } from '../design-system/components/CompassXLogo';
import { cn } from '../design-system/cn';

export type NavigationPage =
  | 'dashboard'
  | 'workorders'
  | 'permits'
  | 'workflows'
  | 'fields'
  | 'gates'
  | 'audit'
  | 'users';

interface SidebarProps {
  currentPage: NavigationPage;
  onNavigate: (page: NavigationPage) => void;
  stats?: {
    workordersCount?: number;
    permitsCount?: number;
    activePermits?: number;
  };
}

export const Sidebar: React.FC<SidebarProps> = ({ currentPage, onNavigate, stats }) => {
  const navSections = [
    {
      title: 'OPERATIONS',
      items: [
        {
          id: 'dashboard' as NavigationPage,
          label: 'Dashboard',
          icon: <LayoutDashboard className="w-4 h-4 shrink-0 text-gray-500" />,
        },
        {
          id: 'workorders' as NavigationPage,
          label: 'Work Orders',
          icon: <ClipboardList className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />,
          badge: stats?.workordersCount !== undefined ? `${stats.workordersCount}` : undefined,
        },
        {
          id: 'permits' as NavigationPage,
          label: 'Permits to Work',
          icon: <FileCheck2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />,
          badge: stats?.activePermits !== undefined ? `${stats.activePermits} Active` : undefined,
          badgeVariant: 'active',
        },
      ],
    },
    {
      title: 'ENGINE CONFIGURATION',
      items: [
        {
          id: 'workflows' as NavigationPage,
          label: 'Workflow Designer',
          icon: <Workflow className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />,
        },
        {
          id: 'gates' as NavigationPage,
          label: 'Gate Registry',
          icon: <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />,
        },
        {
          id: 'fields' as NavigationPage,
          label: 'Custom Fields',
          icon: <Sliders className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />,
        },
      ],
    },
    {
      title: 'SYSTEM & AUDIT',
      items: [
        {
          id: 'audit' as NavigationPage,
          label: 'Event Audit Stream',
          icon: <History className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />,
        },
        {
          id: 'users' as NavigationPage,
          label: 'Users & Roles (RBAC)',
          icon: <Users className="w-4 h-4 text-gray-600 dark:text-gray-400 shrink-0" />,
        },
      ],
    },
  ];

  return (
    <aside className="w-64 h-full bg-[var(--cx-color-surface-subtle)] border-r border-[var(--cx-color-border)] flex flex-col justify-between select-none shrink-0 overflow-y-auto">
      <div>
        {/* Logo Header */}
        <div className="h-14 px-4 flex items-center gap-3 border-b border-[var(--cx-color-border)] bg-[var(--cx-color-surface)]">
          <CompassXLogo size={24} color="#2272B4" />
          <div className="min-w-0">
            <div className="font-bold text-sm tracking-tight text-[var(--cx-color-text)] flex items-center gap-1">
              <span>Compass</span>
              <span className="text-[var(--cx-color-brand-primary)]">X</span>
              <span className="text-[9px] font-bold text-[var(--cx-color-brand-primary)] bg-blue-50 dark:bg-blue-950 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-900 ml-1">
                EAM
              </span>
            </div>
            <div className="text-[10px] text-[var(--cx-color-text-muted)] truncate font-medium">
              Enterprise Asset Management
            </div>
          </div>
        </div>

        {/* Nav Sections */}
        <div className="py-4 px-3 space-y-5">
          {navSections.map((sec, idx) => (
            <div key={idx}>
              <div className="px-3 pb-1.5 text-[10px] font-bold tracking-wider text-[var(--cx-color-text-subtle)] uppercase">
                {sec.title}
              </div>
              <div className="space-y-0.5">
                {sec.items.map((item) => {
                  const isActive = currentPage === item.id;
                  return (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => onNavigate(item.id)}
                      className={cn(
                        'w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium text-left transition-all cursor-pointer',
                        isActive
                          ? 'bg-[var(--cx-color-surface)] text-[var(--cx-color-brand-primary)] shadow-xs border border-[var(--cx-color-border)] font-semibold'
                          : 'text-[var(--cx-color-text)] hover:bg-[var(--cx-color-surface-hover)] border border-transparent'
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 pr-2">
                        {item.icon}
                        <span className="truncate">{item.label}</span>
                      </div>
                      {item.badge !== undefined && (
                        <span
                          className={cn(
                            'shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap',
                            isActive
                              ? 'bg-blue-100 dark:bg-blue-900/50 text-[var(--cx-color-brand-primary)]'
                              : item.badgeVariant === 'active'
                              ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                              : 'bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
                          )}
                        >
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer Info */}
      <div className="p-3.5 border-t border-[var(--cx-color-border)] text-[10px] text-[var(--cx-color-text-subtle)] bg-[var(--cx-color-surface)]">
        <div className="font-semibold text-[var(--cx-color-text-muted)] flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>Event Sourced & CQRS Engine</span>
        </div>
        <div className="mt-0.5 text-gray-400">Spec v1.0.0 Locked • 100% Deterministic</div>
      </div>
    </aside>
  );
};
