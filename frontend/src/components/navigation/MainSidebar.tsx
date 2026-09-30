import React, { useState, useRef, useEffect } from 'react';
import {
  GitBranch,
  Inbox,
  FolderClosed,
  Layers,
  PenTool,
  ListChecks,
  ShieldCheck,
  Users,
  Building2,
  AlarmClock,
  Settings,
  Plus,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  FilePlus,
  Workflow,
  UserPlus,
} from 'lucide-react';
import { navigate } from '../../lib/router';

export type MainNavTab =
  | 'records'
  | 'documents'
  | 'workflows'
  | 'entities'
  | 'forms'
  | 'lists'
  | 'conditions'
  | 'people'
  | 'organizations'
  | 'escalations'
  | 'settings';

interface MainSidebarProps {
  activeTab: MainNavTab;
  onNavigate: (tab: MainNavTab) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const MainSidebar: React.FC<MainSidebarProps> = ({
  activeTab,
  onNavigate,
  collapsed: controlledCollapsed,
  onToggleCollapse: controlledToggle,
}) => {
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const [isNewMenuOpen, setIsNewMenuOpen] = useState(false);
  const newMenuRef = useRef<HTMLDivElement>(null);

  const isCollapsed = controlledCollapsed !== undefined ? controlledCollapsed : internalCollapsed;
  const toggleCollapse = controlledToggle || (() => setInternalCollapsed(!internalCollapsed));

  // Close "+ New" dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (newMenuRef.current && !newMenuRef.current.contains(e.target as Node)) {
        setIsNewMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const navItem = (tab: MainNavTab, label: string, Icon: React.ComponentType<{ className?: string }>) => {
    const isActive = activeTab === tab;
    return (
      <button
        key={tab}
        type="button"
        onClick={() => onNavigate(tab)}
        title={isCollapsed ? label : undefined}
        className={`group flex w-full items-center rounded-md px-2.5 py-1.5 text-xs transition-colors ${
          isCollapsed ? 'justify-center' : 'gap-2.5'
        } ${
          isActive
            ? 'bg-[#E7EDF2] font-semibold text-[#0B5CAD]'
            : 'font-normal text-gray-700 hover:bg-[#EBEBEB] hover:text-gray-950'
        }`}
      >
        <Icon
          className={`h-4 w-4 shrink-0 transition-colors ${
            isActive ? 'text-[#0B5CAD]' : 'text-gray-500 group-hover:text-gray-800'
          }`}
        />
        {!isCollapsed && <span className="truncate flex-1 text-left">{label}</span>}
      </button>
    );
  };

  return (
    <aside
      className={`relative flex flex-col bg-[#F7F7F7] border-none transition-all duration-200 ease-in-out shrink-0 select-none h-full ${
        isCollapsed ? 'w-14' : 'w-52'
      }`}
    >
      {/* Top Action Button "+ New" (Matches exact #F8EAEA pink pill) */}
      <div className="p-2.5 shrink-0 relative" ref={newMenuRef}>
        {isCollapsed ? (
          <button
            type="button"
            onClick={() => setIsNewMenuOpen(!isNewMenuOpen)}
            title="Create New..."
            className="flex h-8 w-8 mx-auto items-center justify-center rounded-md bg-[#F8EAEA] text-[#D13438] border border-[#F2D6D6] hover:bg-[#F3DDDD] transition-colors shadow-2xs font-semibold"
          >
            <Plus className="h-4 w-4 stroke-[2.5]" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setIsNewMenuOpen(!isNewMenuOpen)}
            className="flex w-full items-center justify-between rounded-md bg-[#F8EAEA] border border-[#F2D6D6] px-3 py-1.5 text-xs font-semibold text-[#D13438] hover:bg-[#F3DDDD] transition-colors shadow-2xs"
          >
            <span className="flex items-center gap-1.5">
              <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
              <span>New</span>
            </span>
            <ChevronDown
              className={`h-3 w-3 text-[#D13438] transition-transform ${
                isNewMenuOpen ? 'rotate-180' : ''
              }`}
            />
          </button>
        )}

        {/* Dropdown Menu for "+ New" */}
        {isNewMenuOpen && (
          <div
            className={`absolute z-50 mt-1 w-52 rounded-lg border border-gray-200 bg-white py-1 shadow-lg ${
              isCollapsed ? 'left-14 top-2' : 'left-2.5 right-2.5 top-11'
            }`}
          >
            <button
              type="button"
              onClick={() => {
                setIsNewMenuOpen(false);
                navigate('/create', { type: 'permit' });
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 text-left transition-colors"
            >
              <FilePlus className="h-3.5 w-3.5 text-gray-400" />
              <span>New Permit / Work Order</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setIsNewMenuOpen(false);
                navigate('/workflows/new');
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 text-left transition-colors"
            >
              <Workflow className="h-3.5 w-3.5 text-gray-400" />
              <span>New Workflow</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setIsNewMenuOpen(false);
                navigate('/entities/design');
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 text-left transition-colors"
            >
              <Layers className="h-3.5 w-3.5 text-gray-400" />
              <span>New Entity Designer</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setIsNewMenuOpen(false);
                navigate('/organizations/new');
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 text-left transition-colors"
            >
              <Building2 className="h-3.5 w-3.5 text-gray-400" />
              <span>New Organization</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setIsNewMenuOpen(false);
                navigate('/people');
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 text-left transition-colors"
            >
              <UserPlus className="h-3.5 w-3.5 text-gray-400" />
              <span>New Person</span>
            </button>
          </div>
        )}
      </div>

      {/* Main Navigation List */}
      <nav className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
        {/* Workspace Core */}
        {navItem('records', 'Records', Inbox)}
        {navItem('documents', 'Documents', FolderClosed)}
        {navItem('workflows', 'Workflows', GitBranch)}

        {/* Section Divider: Architecture */}
        <div className="pt-3 pb-0.5">
          {!isCollapsed ? (
            <div className="px-2.5 text-xs font-semibold text-gray-500">
              Architecture
            </div>
          ) : (
            <div className="my-1 border-t border-gray-200" />
          )}
        </div>

        {navItem('entities', 'Entities', Layers)}
        {navItem('forms', 'Forms', PenTool)}
        {navItem('lists', 'Lists', ListChecks)}
        {navItem('conditions', 'Conditions', ShieldCheck)}

        {/* Section Divider: Administration */}
        <div className="pt-3 pb-0.5">
          {!isCollapsed ? (
            <div className="px-2.5 text-xs font-semibold text-gray-500">
              Admin & Assets
            </div>
          ) : (
            <div className="my-1 border-t border-gray-200" />
          )}
        </div>

        {navItem('people', 'People & Roles', Users)}
        {navItem('organizations', 'Asset Hierarchy', Building2)}
        {navItem('escalations', 'Escalations', AlarmClock)}
      </nav>

      {/* Bottom Global Settings & Sidebar Collapse */}
      <div className="p-2 shrink-0 space-y-0.5">
        {navItem('settings', 'Settings', Settings)}

        <button
          type="button"
          onClick={toggleCollapse}
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={`flex w-full items-center rounded-md px-2.5 py-1.5 text-xs text-gray-500 hover:bg-[#EBEBEB] hover:text-gray-800 transition-colors ${
            isCollapsed ? 'justify-center' : 'gap-2'
          }`}
        >
          {isCollapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <>
              <PanelLeftClose className="h-4 w-4" />
              <span>Collapse Sidebar</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
};
