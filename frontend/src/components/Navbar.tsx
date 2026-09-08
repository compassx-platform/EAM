import React, { useState } from 'react';
import { UserRoleSwitcher } from './RBAC/UserRoleSwitcher';
import { Clock, RotateCcw, Sun, Moon, Database, CheckCircle2 } from 'lucide-react';
import { api } from '../api/client';
import { Button } from '../design-system/components/Button';

interface NavbarProps {
  pageTitle?: string;
  onRefresh?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ pageTitle = 'Workflow Engine', onRefresh }) => {
  const [isDark, setIsDark] = useState(false);
  const [expiryChecking, setExpiryChecking] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

  const toggleTheme = () => {
    const nextTheme = !isDark;
    setIsDark(nextTheme);
    if (nextTheme) {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
    }
  };

  const handleTriggerExpiry = async () => {
    setExpiryChecking(true);
    try {
      const res = await api.triggerExpiryCheck();
      setNotification(`Expiry check completed: ${res.expired_count} permits transitioned to Expired.`);
      setTimeout(() => setNotification(null), 4000);
      if (onRefresh) onRefresh();
    } catch (err: any) {
      alert(`Error checking expiry: ${err.message}`);
    } finally {
      setExpiryChecking(false);
    }
  };

  const handleReseed = async () => {
    if (confirm('Reseed the database with initial workflows, gates, users, and sample records?')) {
      try {
        await api.reseed();
        setNotification('Database successfully reset to initial seed state.');
        setTimeout(() => setNotification(null), 4000);
        if (onRefresh) onRefresh();
      } catch (err: any) {
        alert(`Error reseeding: ${err.message}`);
      }
    }
  };

  return (
    <header className="sticky top-0 z-30 w-full bg-[var(--cx-color-surface)] border-b border-[var(--cx-color-border)] shadow-xs flex-shrink-0">
      <div className="flex items-center justify-between px-6 h-14">
        {/* Current View Breadcrumb / Title */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="text-sm font-bold text-[var(--cx-color-text)] truncate">
            {pageTitle}
          </div>
          <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            CQRS Active
          </span>
        </div>

        {/* Global actions & Persona Switcher */}
        <div className="flex items-center gap-2.5">
          {notification && (
            <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs rounded-md animate-in fade-in duration-150">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{notification}</span>
            </div>
          )}

          {/* Permit Expiry Checker trigger (Section 7.4) */}
          <Button
            size="sm"
            variant="secondary"
            loading={expiryChecking}
            onClick={handleTriggerExpiry}
            icon={<Clock className="w-3.5 h-3.5 text-amber-600" />}
            title="Check and transition expired Active permits (system actor)"
          >
            Run Expiry Check
          </Button>

          {/* Reseed DB */}
          <Button
            size="sm"
            variant="ghost"
            onClick={handleReseed}
            icon={<Database className="w-3.5 h-3.5 text-gray-500" />}
            title="Reset database to seed defaults"
          >
            Reset Seed
          </Button>

          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="p-1.5 text-[var(--cx-color-text-muted)] hover:bg-[var(--cx-color-surface-hover)] rounded-md transition-colors cursor-pointer"
            title="Toggle light/dark theme"
          >
            {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* Role & Persona Switcher */}
          <UserRoleSwitcher onActorChanged={onRefresh} />
        </div>
      </div>
    </header>
  );
};
