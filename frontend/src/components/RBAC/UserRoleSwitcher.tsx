import React, { useState, useEffect } from 'react';
import { Shield, User, Check, ChevronDown } from 'lucide-react';
import { api, getActorContext, setActorContext } from '../../api/client';
import { AppUser } from '../../types';

interface UserRoleSwitcherProps {
  onActorChanged?: () => void;
}

export const UserRoleSwitcher: React.FC<UserRoleSwitcherProps> = ({ onActorChanged }) => {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [currentActor, setCurrentActor] = useState(getActorContext());
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    api.getUsers().then(setUsers).catch(console.error);
  }, []);

  const handleSelectUser = (user: AppUser, role: string) => {
    setActorContext(user.email, role);
    setCurrentActor({ actorId: user.email, role });
    setIsOpen(false);
    if (onActorChanged) onActorChanged();
  };

  const currentUserObj = users.find((u) => u.email === currentActor.actorId);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 bg-[var(--cx-color-surface-subtle)] hover:bg-[var(--cx-color-surface-hover)] border border-[var(--cx-color-border)] rounded-[var(--cx-radius-md)] text-xs font-medium text-[var(--cx-color-text)] transition-colors"
      >
        <div className="w-5 h-5 rounded-full bg-[var(--cx-color-brand-primary)] text-white flex items-center justify-center font-bold text-[10px]">
          {currentActor.role.charAt(0)}
        </div>
        <div className="text-left leading-tight">
          <div className="font-semibold text-[11px] text-[var(--cx-color-text)]">
            {currentUserObj?.display_name || currentActor.actorId.split('@')[0]}
          </div>
          <div className="text-[10px] text-[var(--cx-color-text-muted)] flex items-center gap-1">
            <Shield className="w-2.5 h-2.5 text-[var(--cx-color-brand-primary)]" />
            <span>{currentActor.role}</span>
          </div>
        </div>
        <ChevronDown className="w-3.5 h-3.5 text-[var(--cx-color-text-muted)] ml-1" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 bg-[var(--cx-color-surface)] border border-[var(--cx-color-border)] rounded-[var(--cx-radius-lg)] shadow-[var(--cx-shadow-3)] py-2 z-50 animate-in fade-in zoom-in-95 duration-100">
          <div className="px-3 py-1.5 border-b border-[var(--cx-color-border)] text-[11px] font-semibold text-[var(--cx-color-text-muted)] uppercase tracking-wider">
            Switch Persona / Active Role (RBAC)
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {users.map((u) => (
              <div key={u.id} className="px-2 py-1">
                <div className="text-[11px] font-semibold px-2 text-[var(--cx-color-text-muted)]">
                  {u.display_name} ({u.email})
                </div>
                <div className="mt-1 space-y-0.5">
                  {u.roles.map((r) => {
                    const isSelected =
                      currentActor.actorId === u.email && currentActor.role === r;
                    return (
                      <button
                        key={`${u.id}-${r}`}
                        onClick={() => handleSelectUser(u, r)}
                        className={`w-full flex items-center justify-between px-3 py-1.5 rounded-md text-xs transition-colors ${
                          isSelected
                            ? 'bg-blue-50 dark:bg-blue-950/60 text-[var(--cx-color-brand-primary)] font-semibold'
                            : 'text-[var(--cx-color-text)] hover:bg-[var(--cx-color-surface-hover)]'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <Shield className="w-3.5 h-3.5" />
                          {r}
                        </span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-[var(--cx-color-brand-primary)]" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
