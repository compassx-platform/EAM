import React, { useState, useRef, useEffect } from 'react';
import {
  Building2,
  Layers,
  Store,
  Plus,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  Layers3,
  MapPin,
  FolderTree,
  Tag,
  Gauge,
} from 'lucide-react';

interface OrganizationsSidebarProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onNewOrganization?: () => void;
  onNewCompanySet?: () => void;
  onNewCompany?: () => void;
  onNewLocation?: () => void;
  onNewAsset?: () => void;
  onNewClassification?: () => void;
  onNewMeter?: () => void;
}

export const OrganizationsSidebar: React.FC<OrganizationsSidebarProps> = ({
  currentPath,
  onNavigate,
  collapsed,
  onToggleCollapse,
  onNewOrganization,
  onNewCompanySet,
  onNewCompany,
  onNewLocation,
  onNewAsset,
  onNewClassification,
  onNewMeter,
}) => {
  const [isNewMenuOpen, setIsNewMenuOpen] = useState(false);
  const newMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (newMenuRef.current && !newMenuRef.current.contains(e.target as Node)) {
        setIsNewMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isCompanySets = currentPath.startsWith('/organizations/company-sets');
  const isCompanies = currentPath.startsWith('/organizations/companies');
  const isLocations = currentPath.startsWith('/organizations/locations');
  const isAssets = currentPath.startsWith('/organizations/assets');
  const isClassifications = currentPath.startsWith('/organizations/classifications');
  const isMeters = currentPath.startsWith('/organizations/meters');
  const isOrgs = !isCompanySets && !isCompanies && !isLocations && !isAssets && !isClassifications && !isMeters;

  const coreNavItems = [
    {
      id: 'orgs',
      label: 'Organizations',
      icon: Building2,
      path: '/organizations',
      active: isOrgs,
    },
    {
      id: 'locations',
      label: 'Sites & Locations',
      icon: MapPin,
      path: '/organizations/locations',
      active: isLocations,
    },
    {
      id: 'assets',
      label: 'Asset Hierarchy',
      icon: FolderTree,
      path: '/organizations/assets',
      active: isAssets,
    },
    {
      id: 'meters',
      label: 'Meters & Condition',
      icon: Gauge,
      path: '/organizations/meters',
      active: isMeters,
    },
    {
      id: 'classifications',
      label: 'Classifications',
      icon: Tag,
      path: '/organizations/classifications',
      active: isClassifications,
    },
    {
      id: 'company-sets',
      label: 'Company Sets',
      icon: Layers,
      path: '/organizations/company-sets',
      active: isCompanySets,
    },
    {
      id: 'companies',
      label: 'Companies (Vendors)',
      icon: Store,
      path: '/organizations/companies',
      active: isCompanies,
    },
  ];

  return (
    <aside
      className={`relative flex flex-col bg-white border-r border-gray-200 transition-all duration-200 ease-in-out shrink-0 select-none h-full ${
        collapsed ? 'w-14' : 'w-56'
      }`}
    >
      {/* Top Header / Title */}
      <div className="flex h-11 items-center justify-between px-3 shrink-0 border-b border-gray-100">
        {!collapsed && (
          <div className="flex items-center gap-2 overflow-hidden">
            <span className="text-xs font-bold tracking-tight text-gray-800 truncate">
              Asset Hierarchy
            </span>
          </div>
        )}

        <button
          type="button"
          onClick={onToggleCollapse}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={`flex h-6 w-6 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors ${
            collapsed ? 'mx-auto' : ''
          }`}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-3.5 w-3.5" />
          ) : (
            <PanelLeftClose className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {/* Action Button "+ New" (Matches MainSidebar Databricks salmon style) */}
      <div className="p-2.5 shrink-0 relative" ref={newMenuRef}>
        {collapsed ? (
          <button
            type="button"
            onClick={() => setIsNewMenuOpen(!isNewMenuOpen)}
            title="Create New..."
            className="flex h-8 w-8 mx-auto items-center justify-center rounded-md bg-[#FFF0ED] text-[#C23924] border border-[#FCD6CF] hover:bg-[#FFE5E0] transition-colors shadow-2xs font-semibold"
          >
            <Plus className="h-4 w-4 stroke-[2.5]" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setIsNewMenuOpen(!isNewMenuOpen)}
            className="flex w-full items-center justify-between rounded-md bg-[#FFF0ED] border border-[#FCD6CF] px-3 py-1.5 text-xs font-semibold text-[#C23924] hover:bg-[#FFE5E0] transition-colors shadow-2xs"
          >
            <span className="flex items-center gap-1.5">
              <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
              <span>New</span>
            </span>
            <ChevronDown
              className={`h-3 w-3 text-[#C23924] transition-transform ${
                isNewMenuOpen ? 'rotate-180' : ''
              }`}
            />
          </button>
        )}

        {/* Dropdown Menu for "+ New" */}
        {isNewMenuOpen && (
          <div
            className={`absolute z-50 mt-1 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg ${
              collapsed ? 'left-14 top-2' : 'left-2.5 right-2.5 top-11'
            }`}
          >
            <button
              type="button"
              onClick={() => {
                setIsNewMenuOpen(false);
                if (onNewOrganization) {
                  onNewOrganization();
                } else {
                  onNavigate('/organizations/new');
                }
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
                if (onNewLocation) {
                  onNewLocation();
                } else {
                  onNavigate('/organizations/locations');
                }
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 text-left transition-colors"
            >
              <MapPin className="h-3.5 w-3.5 text-gray-400" />
              <span>New Location</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setIsNewMenuOpen(false);
                if (onNewAsset) {
                  onNewAsset();
                } else {
                  onNavigate('/organizations/assets');
                }
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 text-left transition-colors"
            >
              <FolderTree className="h-3.5 w-3.5 text-gray-400" />
              <span>New Asset</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setIsNewMenuOpen(false);
                if (onNewClassification) {
                  onNewClassification();
                } else {
                  onNavigate('/organizations/classifications');
                }
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 text-left transition-colors"
            >
              <Tag className="h-3.5 w-3.5 text-gray-400" />
              <span>New Classification</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setIsNewMenuOpen(false);
                if (onNewMeter) {
                  onNewMeter();
                } else {
                  onNavigate('/organizations/meters');
                }
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 text-left transition-colors"
            >
              <Gauge className="h-3.5 w-3.5 text-gray-400" />
              <span>New Meter</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setIsNewMenuOpen(false);
                if (onNewCompanySet) {
                  onNewCompanySet();
                } else {
                  onNavigate('/organizations/company-sets/new');
                }
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 text-left transition-colors"
            >
              <Layers className="h-3.5 w-3.5 text-gray-400" />
              <span>New Company Set</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setIsNewMenuOpen(false);
                if (onNewCompany) {
                  onNewCompany();
                } else {
                  onNavigate('/organizations/companies');
                }
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 text-left transition-colors"
            >
              <Store className="h-3.5 w-3.5 text-gray-400" />
              <span>Add Company to Org</span>
            </button>
          </div>
        )}
      </div>

      {/* Main Navigation List */}
      <nav className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
        <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">
          {!collapsed && 'Asset Hierarchy'}
        </div>
        {coreNavItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.path)}
              title={collapsed ? item.label : undefined}
              className={`group flex w-full items-center rounded-md px-2.5 py-1.5 text-xs transition-colors ${
                collapsed ? 'justify-center' : 'gap-2.5'
              } ${
                item.active
                  ? 'bg-sky-50 font-semibold text-sky-900'
                  : 'font-medium text-gray-600 hover:bg-gray-100/70 hover:text-gray-900'
              }`}
            >
              <Icon
                className={`h-4 w-4 shrink-0 transition-colors ${
                  item.active
                    ? 'text-sky-700'
                    : 'text-gray-400 group-hover:text-gray-600'
                }`}
              />
              {!collapsed && (
                <span className="truncate">{item.label}</span>
              )}
            </button>
          );
        })}
      </nav>
    </aside>
  );
};
