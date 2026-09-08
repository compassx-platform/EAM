import React from 'react';
import { cn } from '../cn';

export interface TabItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  badge?: string | number;
}

interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (id: string) => void;
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({
  tabs,
  activeTab,
  onChange,
  className,
}) => {
  return (
    <div className={cn('flex items-center gap-1 border-b border-[var(--cx-color-border)]', className)}>
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors -mb-[1px]',
              isActive
                ? 'border-[var(--cx-color-brand-primary)] text-[var(--cx-color-brand-primary)]'
                : 'border-transparent text-[var(--cx-color-text-muted)] hover:text-[var(--cx-color-text)] hover:border-gray-300'
            )}
          >
            {tab.icon}
            <span>{tab.label}</span>
            {tab.badge !== undefined && (
              <span
                className={cn(
                  'px-1.5 py-0.5 rounded-full text-[10px] font-bold',
                  isActive
                    ? 'bg-blue-100 dark:bg-blue-900/50 text-[var(--cx-color-brand-primary)]'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-500'
                )}
              >
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
