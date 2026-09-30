import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Building2,
  MapPin,
  Cpu,
  Layers,
  Search,
  ChevronRight,
  ChevronDown,
  Plus,
  RefreshCw,
  FolderTree,
  Edit2,
  Trash2,
  ShieldCheck,
  AlertCircle,
  Tag,
  DollarSign,
  Calendar,
  Layers3,
  Box,
  Wrench,
  X,
  ExternalLink,
  ChevronUp,
  Maximize2,
  Minimize2,
  ArrowUpRight,
  Check,
} from 'lucide-react';
import { api } from '../../api/client';
import type {
  DrilldownSite,
  DrilldownLocation,
  DrilldownAsset,
  Location,
  Asset,
  Site,
  Organization,
  LocationType,
  LocationStatus,
  AssetStatus,
} from '../../types';
import { InfoTooltip } from '../people/InfoTooltip';
import { InstanceSpecificationsInspector } from './InstanceSpecificationsInspector';

// Helper for status badge styling
const getStatusBadge = (status: string) => {
  switch (status?.toUpperCase()) {
    case 'OPERATING':
    case 'ACTIVE':
      return {
        bg: 'bg-emerald-50 text-emerald-700 border-emerald-200/70',
        dot: 'bg-emerald-500',
        label: 'Operating',
      };
    case 'NOT_READY':
    case 'NOT READY':
      return {
        bg: 'bg-amber-50 text-amber-700 border-amber-200/70',
        dot: 'bg-amber-500',
        label: 'Not Ready',
      };
    case 'IN_REPAIR':
    case 'IN REPAIR':
      return {
        bg: 'bg-indigo-50 text-indigo-700 border-indigo-200/70',
        dot: 'bg-indigo-500',
        label: 'In Repair',
      };
    case 'DECOMMISSIONED':
    case 'INACTIVE':
      return {
        bg: 'bg-gray-100 text-gray-600 border-gray-200',
        dot: 'bg-gray-400',
        label: 'Decommissioned',
      };
    default:
      return {
        bg: 'bg-slate-100 text-slate-700 border-slate-200',
        dot: 'bg-slate-400',
        label: status || 'Unknown',
      };
  }
};

const getLocationTypeBadge = (type: string) => {
  switch (type?.toUpperCase()) {
    case 'OPERATING':
      return { bg: 'bg-blue-50 text-blue-700 border-blue-200/70', label: 'Operating' };
    case 'STOREROOM':
      return { bg: 'bg-purple-50 text-purple-700 border-purple-200/70', label: 'Storeroom' };
    case 'HOLDING':
      return { bg: 'bg-amber-50 text-amber-700 border-amber-200/70', label: 'Holding' };
    case 'SALVAGE':
      return { bg: 'bg-rose-50 text-rose-700 border-rose-200/70', label: 'Salvage' };
    case 'VENDOR':
      return { bg: 'bg-emerald-50 text-emerald-700 border-emerald-200/70', label: 'Vendor' };
    case 'REPAIR':
      return { bg: 'bg-cyan-50 text-cyan-700 border-cyan-200/70', label: 'Repair' };
    default:
      return { bg: 'bg-gray-100 text-gray-600 border-gray-200', label: type || 'Location' };
  }
};

const getPriorityBadge = (p: number) => {
  switch (p) {
    case 1:
      return { bg: 'bg-rose-50 text-rose-700 border-rose-200', label: 'P1 Critical' };
    case 2:
      return { bg: 'bg-orange-50 text-orange-700 border-orange-200', label: 'P2 High' };
    case 3:
      return { bg: 'bg-yellow-50 text-yellow-800 border-yellow-200', label: 'P3 Medium' };
    case 4:
      return { bg: 'bg-blue-50 text-blue-700 border-blue-200', label: 'P4 Low' };
    default:
      return { bg: 'bg-gray-100 text-gray-600 border-gray-200', label: `P${p}` };
  }
};

type SelectedNodeType =
  | { kind: 'site'; data: DrilldownSite }
  | { kind: 'location'; data: DrilldownLocation; siteId: string }
  | { kind: 'asset'; data: DrilldownAsset; siteId: string; locationId?: string | null };

export const AssetDrilldownView: React.FC = () => {
  const [drilldownData, setDrilldownData] = useState<DrilldownSite[]>([]);
  const [sitesList, setSitesList] = useState<Site[]>([]);
  const [orgsList, setOrgsList] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedSiteFilter, setSelectedSiteFilter] = useState<string>('ALL');
  const [selectedOrgFilter, setSelectedOrgFilter] = useState<string>('ALL');

  // Expanded nodes set: node key format -> "site:SITE_ID", "loc:SITE_ID:LOC_ID", "asset:SITE_ID:ASSET_ID"
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  // Selected node for inspector
  const [selectedNode, setSelectedNode] = useState<SelectedNodeType | null>(null);

  // Modals state
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [locationModalMode, setLocationModalMode] = useState<'create' | 'edit'>('create');
  const [editingLocation, setEditingLocation] = useState<Partial<Location> | null>(null);

  const [isAssetModalOpen, setIsAssetModalOpen] = useState(false);
  const [assetModalMode, setAssetModalMode] = useState<'create' | 'edit'>('create');
  const [editingAsset, setEditingAsset] = useState<Partial<Asset> | null>(null);

  // Load Data
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [drilldown, sites, orgs] = await Promise.all([
        api.getDrilldownHierarchy({
          site_id: selectedSiteFilter === 'ALL' ? undefined : selectedSiteFilter,
          org_id: selectedOrgFilter === 'ALL' ? undefined : selectedOrgFilter,
        }),
        api.listSites(),
        api.listOrganizations(),
      ]);

      setDrilldownData(drilldown);
      setSitesList(sites);
      setOrgsList(orgs);

      // Auto-expand all sites and top locations on first load
      const initialKeys = new Set<string>();
      drilldown.forEach((s) => {
        initialKeys.add(`site:${s.site_id}`);
        s.locations_tree.forEach((l) => {
          initialKeys.add(`loc:${s.site_id}:${l.location_id}`);
          // Expand first sub-level if available
          l.children_locations?.forEach((cl) => {
            initialKeys.add(`loc:${s.site_id}:${cl.location_id}`);
          });
          l.assets?.forEach((a) => {
            initialKeys.add(`asset:${s.site_id}:${a.asset_id}`);
          });
        });
      });
      setExpandedKeys(initialKeys);

      // Select first site or first asset by default if nothing selected
      if (!selectedNode && drilldown.length > 0) {
        if (drilldown[0].locations_tree[0]?.assets?.[0]) {
          setSelectedNode({
            kind: 'asset',
            data: drilldown[0].locations_tree[0].assets[0],
            siteId: drilldown[0].site_id,
            locationId: drilldown[0].locations_tree[0].location_id,
          });
        } else if (drilldown[0].locations_tree[0]) {
          setSelectedNode({
            kind: 'location',
            data: drilldown[0].locations_tree[0],
            siteId: drilldown[0].site_id,
          });
        } else {
          setSelectedNode({
            kind: 'site',
            data: drilldown[0],
          });
        }
      }
    } catch (err) {
      console.error('Failed to load asset hierarchy drilldown:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedSiteFilter, selectedOrgFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Toggle node expansion
  const toggleExpand = (key: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Expand all / Collapse all
  const handleExpandAll = () => {
    const all = new Set<string>();
    drilldownData.forEach((s) => {
      all.add(`site:${s.site_id}`);
      const addLoc = (loc: DrilldownLocation) => {
        all.add(`loc:${s.site_id}:${loc.location_id}`);
        loc.children_locations?.forEach(addLoc);
        loc.assets?.forEach(addAsset);
      };
      const addAsset = (ast: DrilldownAsset) => {
        all.add(`asset:${s.site_id}:${ast.asset_id}`);
        ast.children?.forEach(addAsset);
      };
      s.locations_tree.forEach(addLoc);
      s.unassigned_assets.forEach(addAsset);
    });
    setExpandedKeys(all);
  };

  const handleCollapseAll = () => {
    setExpandedKeys(new Set());
  };

  // Delete Location
  const handleDeleteLocation = async (siteId: string, locationId: string) => {
    if (
      !window.confirm(
        `Are you sure you want to delete Location "${locationId}" in Site "${siteId}"? Any child locations or installed assets must be reassigned.`
      )
    ) {
      return;
    }
    try {
      await api.deleteLocation(siteId, locationId);
      setSelectedNode(null);
      fetchData();
    } catch (err: any) {
      alert(err?.message || 'Failed to delete location.');
    }
  };

  // Delete Asset
  const handleDeleteAsset = async (siteId: string, assetId: string) => {
    if (
      !window.confirm(
        `Are you sure you want to delete Asset "${assetId}" in Site "${siteId}"?`
      )
    ) {
      return;
    }
    try {
      await api.deleteAsset(siteId, assetId);
      setSelectedNode(null);
      fetchData();
    } catch (err: any) {
      alert(err?.message || 'Failed to delete asset.');
    }
  };

  // Helper filter search
  const isMatch = useCallback(
    (text?: string | null) => {
      if (!search.trim() || !text) return false;
      return text.toLowerCase().includes(search.toLowerCase().trim());
    },
    [search]
  );

  return (
    <div className="flex h-full w-full flex-col min-h-0 overflow-hidden bg-slate-50/50">
      {/* Action Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200/80 bg-white px-5 py-3 shrink-0">
        <div className="flex flex-wrap items-center gap-3">
          {/* Quick Search */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-gray-400" />
            <input
              type="text"
              placeholder="Search locations, assets, models, serials..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-64 md:w-80 rounded-lg border border-gray-200 bg-white pl-8 pr-3 text-xs text-gray-800 placeholder-gray-400 focus:border-sky-500 focus:outline-none"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-2 text-gray-400 hover:text-gray-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Org Filter */}
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <span>Org:</span>
            <select
              value={selectedOrgFilter}
              onChange={(e) => setSelectedOrgFilter(e.target.value)}
              className="h-8 rounded-lg border border-gray-200 bg-white px-2.5 text-xs text-gray-700 focus:border-sky-500 focus:outline-none"
            >
              <option value="ALL">All Organizations</option>
              {orgsList.map((o) => (
                <option key={o.org_id} value={o.org_id}>
                  {o.org_id} - {o.name}
                </option>
              ))}
            </select>
          </div>

          {/* Site Filter */}
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <span>Site:</span>
            <select
              value={selectedSiteFilter}
              onChange={(e) => setSelectedSiteFilter(e.target.value)}
              className="h-8 rounded-lg border border-gray-200 bg-white px-2.5 text-xs text-gray-700 focus:border-sky-500 focus:outline-none"
            >
              <option value="ALL">All Sites</option>
              {sitesList.map((s) => (
                <option key={s.site_id} value={s.site_id}>
                  {s.site_id} - {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Expand/Collapse buttons */}
          <div className="flex items-center gap-1 border-l border-gray-200 pl-2">
            <button
              onClick={handleExpandAll}
              title="Expand All Nodes"
              className="flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
            >
              <Maximize2 className="h-3 w-3" />
              <span>Expand All</span>
            </button>
            <button
              onClick={handleCollapseAll}
              title="Collapse All Nodes"
              className="flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
            >
              <Minimize2 className="h-3 w-3" />
              <span>Collapse All</span>
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setLocationModalMode('create');
              setEditingLocation({
                site_id: sitesList[0]?.site_id || 'BEDFORD',
                org_id: sitesList[0]?.org_id || 'EAGLENA',
                type: 'OPERATING',
                status: 'OPERATING',
              });
              setIsLocationModalOpen(true);
            }}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors shadow-2xs"
          >
            <MapPin className="h-3.5 w-3.5 text-sky-600" />
            <span>+ New Location</span>
          </button>

          <button
            onClick={() => {
              setAssetModalMode('create');
              setEditingAsset({
                site_id: sitesList[0]?.site_id || 'BEDFORD',
                org_id: sitesList[0]?.org_id || 'EAGLENA',
                status: 'OPERATING',
                priority: 3,
                purchase_cost: 0,
              });
              setIsAssetModalOpen(true);
            }}
            className="flex h-8 items-center gap-1.5 rounded-lg bg-sky-700 px-3.5 text-xs font-semibold text-white hover:bg-sky-800 transition-colors shadow-2xs"
          >
            <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
            <span>+ New Asset</span>
          </button>

          <button
            onClick={fetchData}
            title="Refresh hierarchy"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Main Split Layout: Left Tree Drilldown & Right Inspector */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left Tree Explorer Panel */}
        <div className="flex-1 overflow-y-auto border-r border-gray-200/80 bg-white p-4">
          {loading ? (
            <div className="flex h-64 flex-col items-center justify-center gap-3">
              <RefreshCw className="h-6 w-6 animate-spin text-sky-600" />
              <p className="text-xs font-medium text-gray-500">
                Building multi-level site & asset hierarchy tree...
              </p>
            </div>
          ) : drilldownData.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center text-center p-6">
              <FolderTree className="h-10 w-10 text-gray-300 mb-2" />
              <p className="text-sm font-semibold text-gray-700">No Hierarchy Found</p>
              <p className="text-xs text-gray-500 max-w-sm mt-1">
                No sites, locations, or assets match the selected criteria. Create a location or asset to begin building the hierarchy.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {drilldownData.map((site) => (
                <SiteTreeNode
                  key={site.site_id}
                  site={site}
                  expandedKeys={expandedKeys}
                  onToggleExpand={toggleExpand}
                  selectedNode={selectedNode}
                  onSelectNode={setSelectedNode}
                  search={search}
                  isMatch={isMatch}
                  onAddLocation={(siteId, parentLocId) => {
                    setLocationModalMode('create');
                    setEditingLocation({
                      site_id: siteId,
                      parent_location_id: parentLocId || null,
                      type: 'OPERATING',
                      status: 'OPERATING',
                    });
                    setIsLocationModalOpen(true);
                  }}
                  onAddAsset={(siteId, locId, parentAssetId) => {
                    setAssetModalMode('create');
                    setEditingAsset({
                      site_id: siteId,
                      location_id: locId || null,
                      parent_asset_id: parentAssetId || null,
                      status: 'OPERATING',
                      priority: 3,
                    });
                    setIsAssetModalOpen(true);
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right Inspector / Detail Panel */}
        <div className="w-80 md:w-96 lg:w-[420px] shrink-0 bg-slate-50/70 overflow-y-auto p-4 flex flex-col min-h-0">
          {selectedNode ? (
            <InspectorPanel
              selectedNode={selectedNode}
              onEditLocation={(loc) => {
                setLocationModalMode('edit');
                setEditingLocation(loc);
                setIsLocationModalOpen(true);
              }}
              onDeleteLocation={(sId, lId) => handleDeleteLocation(sId, lId)}
              onAddSubLocation={(sId, pLocId) => {
                setLocationModalMode('create');
                setEditingLocation({
                  site_id: sId,
                  parent_location_id: pLocId,
                  type: 'OPERATING',
                  status: 'OPERATING',
                });
                setIsLocationModalOpen(true);
              }}
              onEditAsset={(ast) => {
                setAssetModalMode('edit');
                setEditingAsset(ast);
                setIsAssetModalOpen(true);
              }}
              onDeleteAsset={(sId, aId) => handleDeleteAsset(sId, aId)}
              onAddSubAsset={(sId, locId, pAssetId) => {
                setAssetModalMode('create');
                setEditingAsset({
                  site_id: sId,
                  location_id: locId || null,
                  parent_asset_id: pAssetId,
                  status: 'OPERATING',
                  priority: 3,
                });
                setIsAssetModalOpen(true);
              }}
              onSelectChildNode={(node) => setSelectedNode(node)}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-center p-6 text-gray-400">
              <FolderTree className="h-10 w-10 text-gray-300 mb-2" />
              <p className="text-xs font-semibold text-gray-600">No Item Selected</p>
              <p className="text-[11px] text-gray-400 mt-1 max-w-[200px]">
                Click any Site, Location, or Asset in the tree to inspect details, children, and properties.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Location Modal */}
      {isLocationModalOpen && editingLocation && (
        <LocationModal
          mode={locationModalMode}
          initialData={editingLocation}
          sites={sitesList}
          onClose={() => {
            setIsLocationModalOpen(false);
            setEditingLocation(null);
          }}
          onSaved={() => {
            setIsLocationModalOpen(false);
            setEditingLocation(null);
            fetchData();
          }}
        />
      )}

      {/* Asset Modal */}
      {isAssetModalOpen && editingAsset && (
        <AssetModal
          mode={assetModalMode}
          initialData={editingAsset}
          sites={sitesList}
          onClose={() => {
            setIsAssetModalOpen(false);
            setEditingAsset(null);
          }}
          onSaved={() => {
            setIsAssetModalOpen(false);
            setEditingAsset(null);
            fetchData();
          }}
        />
      )}
    </div>
  );
};

// ============================================================================
// Site Tree Node Component
// ============================================================================

interface SiteTreeNodeProps {
  site: DrilldownSite;
  expandedKeys: Set<string>;
  onToggleExpand: (key: string, e?: React.MouseEvent) => void;
  selectedNode: SelectedNodeType | null;
  onSelectNode: (node: SelectedNodeType) => void;
  search: string;
  isMatch: (text?: string | null) => boolean;
  onAddLocation: (siteId: string, parentLocId?: string) => void;
  onAddAsset: (siteId: string, locId?: string, parentAssetId?: string) => void;
}

const SiteTreeNode: React.FC<SiteTreeNodeProps> = ({
  site,
  expandedKeys,
  onToggleExpand,
  selectedNode,
  onSelectNode,
  search,
  isMatch,
  onAddLocation,
  onAddAsset,
}) => {
  const siteKey = `site:${site.site_id}`;
  const isExpanded = expandedKeys.has(siteKey);
  const isSelected = selectedNode?.kind === 'site' && selectedNode.data.site_id === site.site_id;
  const siteMatched = isMatch(site.site_id) || isMatch(site.site_name);

  return (
    <div className="rounded-xl border border-gray-200/90 bg-white overflow-hidden shadow-2xs">
      {/* Site Header Row */}
      <div
        onClick={() => onSelectNode({ kind: 'site', data: site })}
        className={`group flex items-center justify-between px-3 py-2.5 cursor-pointer transition-colors ${
          isSelected
            ? 'bg-sky-50/80 border-l-4 border-l-sky-600'
            : 'hover:bg-slate-50 border-l-4 border-l-transparent'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={(e) => onToggleExpand(siteKey, e)}
            className="flex h-5 w-5 items-center justify-center rounded text-gray-400 hover:bg-gray-200/70 hover:text-gray-700 transition-colors"
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>

          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-sky-100/70 text-sky-700">
            <Building2 className="h-3.5 w-3.5" />
          </div>

          <div className="flex items-center gap-2 truncate">
            <span
              className={`text-xs font-bold font-mono ${
                siteMatched ? 'bg-amber-100 text-amber-900 px-1 rounded' : 'text-gray-900'
              }`}
            >
              {site.site_id}
            </span>
            <span className="text-xs text-gray-600 truncate">{site.site_name}</span>
            <span className="text-[10px] font-semibold text-gray-400 font-mono">
              ({site.org_id})
            </span>
          </div>
        </div>

        {/* Badges and Quick Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700">
            {site.total_locations} Locations • {site.total_assets} Assets
          </span>

          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAddLocation(site.site_id);
              }}
              title="Add Location in this Site"
              className="flex h-6 items-center gap-1 rounded bg-white border border-gray-200 px-1.5 text-[10px] font-medium text-gray-700 hover:bg-gray-50 shadow-2xs"
            >
              <Plus className="h-3 w-3 text-sky-600" />
              <span>Location</span>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAddAsset(site.site_id);
              }}
              title="Add Asset in this Site"
              className="flex h-6 items-center gap-1 rounded bg-white border border-gray-200 px-1.5 text-[10px] font-medium text-gray-700 hover:bg-gray-50 shadow-2xs"
            >
              <Plus className="h-3 w-3 text-sky-600" />
              <span>Asset</span>
            </button>
          </div>
        </div>
      </div>

      {/* Children: Locations Tree & Unassigned Assets */}
      {isExpanded && (
        <div className="border-t border-gray-100 bg-slate-50/30 p-2 pl-4 space-y-1">
          {site.locations_tree.length === 0 && site.unassigned_assets.length === 0 ? (
            <div className="py-2 text-center text-xs text-gray-400 italic">
              No locations or assets registered in this site yet.
            </div>
          ) : (
            <>
              {/* Location Nodes */}
              {site.locations_tree.map((loc) => (
                <LocationTreeNode
                  key={loc.location_id}
                  location={loc}
                  siteId={site.site_id}
                  expandedKeys={expandedKeys}
                  onToggleExpand={onToggleExpand}
                  selectedNode={selectedNode}
                  onSelectNode={onSelectNode}
                  search={search}
                  isMatch={isMatch}
                  onAddLocation={onAddLocation}
                  onAddAsset={onAddAsset}
                  level={0}
                />
              ))}

              {/* Unassigned Assets in Site */}
              {site.unassigned_assets.length > 0 && (
                <div className="pt-2">
                  <div className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                    <Box className="h-3.5 w-3.5 text-gray-400" />
                    <span>Unassigned / Staged Assets ({site.unassigned_assets.length})</span>
                  </div>
                  <div className="space-y-1 pl-2">
                    {site.unassigned_assets.map((asset) => (
                      <AssetTreeNode
                        key={asset.asset_id}
                        asset={asset}
                        siteId={site.site_id}
                        locationId={null}
                        expandedKeys={expandedKeys}
                        onToggleExpand={onToggleExpand}
                        selectedNode={selectedNode}
                        onSelectNode={onSelectNode}
                        search={search}
                        isMatch={isMatch}
                        onAddAsset={onAddAsset}
                        level={1}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Location Tree Node Component (Recursive)
// ============================================================================

interface LocationTreeNodeProps {
  location: DrilldownLocation;
  siteId: string;
  expandedKeys: Set<string>;
  onToggleExpand: (key: string, e?: React.MouseEvent) => void;
  selectedNode: SelectedNodeType | null;
  onSelectNode: (node: SelectedNodeType) => void;
  search: string;
  isMatch: (text?: string | null) => boolean;
  onAddLocation: (siteId: string, parentLocId?: string) => void;
  onAddAsset: (siteId: string, locId?: string, parentAssetId?: string) => void;
  level: number;
}

const LocationTreeNode: React.FC<LocationTreeNodeProps> = ({
  location,
  siteId,
  expandedKeys,
  onToggleExpand,
  selectedNode,
  onSelectNode,
  search,
  isMatch,
  onAddLocation,
  onAddAsset,
  level,
}) => {
  const locKey = `loc:${siteId}:${location.location_id}`;
  const isExpanded = expandedKeys.has(locKey);
  const isSelected =
    selectedNode?.kind === 'location' &&
    selectedNode.data.location_id === location.location_id &&
    selectedNode.siteId === siteId;

  const hasChildren =
    (location.children_locations && location.children_locations.length > 0) ||
    (location.assets && location.assets.length > 0);

  const locMatched =
    isMatch(location.location_id) ||
    isMatch(location.description) ||
    isMatch(location.gl_account);

  const typeBadge = getLocationTypeBadge(location.type);
  const statusBadge = getStatusBadge(location.status);

  return (
    <div className="select-none">
      <div
        onClick={() => onSelectNode({ kind: 'location', data: location, siteId })}
        style={{ paddingLeft: `${Math.max(4, level * 16)}px` }}
        className={`group flex items-center justify-between rounded-lg py-1.5 pr-2 cursor-pointer transition-colors ${
          isSelected
            ? 'bg-sky-100/80 text-sky-900 font-medium'
            : 'hover:bg-slate-100/80 text-gray-700'
        }`}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {hasChildren ? (
            <button
              type="button"
              onClick={(e) => onToggleExpand(locKey, e)}
              className="flex h-5 w-5 items-center justify-center rounded text-gray-400 hover:bg-gray-200/60 hover:text-gray-700"
            >
              {isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </button>
          ) : (
            <div className="w-5" />
          )}

          <MapPin className="h-3.5 w-3.5 text-sky-600 shrink-0" />

          <div className="flex items-center gap-2 truncate text-xs">
            <span
              className={`font-mono font-semibold ${
                locMatched ? 'bg-amber-100 text-amber-900 px-1 rounded' : 'text-gray-900'
              }`}
            >
              {location.location_id}
            </span>
            {location.description && (
              <span className="text-gray-500 truncate text-[11px]">
                {location.description}
              </span>
            )}
          </div>
        </div>

        {/* Badges & Quick Action */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className={`rounded px-1.5 py-0.2 text-[9px] font-semibold border ${typeBadge.bg}`}
          >
            {typeBadge.label}
          </span>

          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAddLocation(siteId, location.location_id);
              }}
              title="Add Sub-Location"
              className="flex h-5 items-center gap-0.5 rounded bg-white border border-gray-200 px-1 text-[9px] font-medium text-gray-600 hover:bg-gray-50"
            >
              <Plus className="h-2.5 w-2.5" />
              <span>Sub-Loc</span>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAddAsset(siteId, location.location_id);
              }}
              title="Add Asset to this Location"
              className="flex h-5 items-center gap-0.5 rounded bg-white border border-gray-200 px-1 text-[9px] font-medium text-gray-600 hover:bg-gray-50"
            >
              <Plus className="h-2.5 w-2.5" />
              <span>Asset</span>
            </button>
          </div>
        </div>
      </div>

      {/* Recursive Children (Sub-locations & Installed Assets) */}
      {isExpanded && hasChildren && (
        <div className="space-y-0.5">
          {/* Sub-locations */}
          {location.children_locations?.map((subLoc) => (
            <LocationTreeNode
              key={subLoc.location_id}
              location={subLoc}
              siteId={siteId}
              expandedKeys={expandedKeys}
              onToggleExpand={onToggleExpand}
              selectedNode={selectedNode}
              onSelectNode={onSelectNode}
              search={search}
              isMatch={isMatch}
              onAddLocation={onAddLocation}
              onAddAsset={onAddAsset}
              level={level + 1}
            />
          ))}

          {/* Installed Assets */}
          {location.assets?.map((asset) => (
            <AssetTreeNode
              key={asset.asset_id}
              asset={asset}
              siteId={siteId}
              locationId={location.location_id}
              expandedKeys={expandedKeys}
              onToggleExpand={onToggleExpand}
              selectedNode={selectedNode}
              onSelectNode={onSelectNode}
              search={search}
              isMatch={isMatch}
              onAddAsset={onAddAsset}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Asset Tree Node Component (Recursive Parent-Child Sub-assemblies)
// ============================================================================

interface AssetTreeNodeProps {
  asset: DrilldownAsset;
  siteId: string;
  locationId?: string | null;
  expandedKeys: Set<string>;
  onToggleExpand: (key: string, e?: React.MouseEvent) => void;
  selectedNode: SelectedNodeType | null;
  onSelectNode: (node: SelectedNodeType) => void;
  search: string;
  isMatch: (text?: string | null) => boolean;
  onAddAsset: (siteId: string, locId?: string, parentAssetId?: string) => void;
  level: number;
}

const AssetTreeNode: React.FC<AssetTreeNodeProps> = ({
  asset,
  siteId,
  locationId,
  expandedKeys,
  onToggleExpand,
  selectedNode,
  onSelectNode,
  search,
  isMatch,
  onAddAsset,
  level,
}) => {
  const assetKey = `asset:${siteId}:${asset.asset_id}`;
  const isExpanded = expandedKeys.has(assetKey);
  const isSelected =
    selectedNode?.kind === 'asset' &&
    selectedNode.data.asset_id === asset.asset_id &&
    selectedNode.siteId === siteId;

  const hasChildren = asset.children && asset.children.length > 0;
  const isSubAssembly = Boolean(asset.parent_asset_id);

  const assetMatched =
    isMatch(asset.asset_id) ||
    isMatch(asset.name) ||
    isMatch(asset.serial_num) ||
    isMatch(asset.manufacturer) ||
    isMatch(asset.model);

  const statusBadge = getStatusBadge(asset.status);
  const priorityBadge = getPriorityBadge(asset.priority);

  return (
    <div className="select-none">
      <div
        onClick={() => onSelectNode({ kind: 'asset', data: asset, siteId, locationId })}
        style={{ paddingLeft: `${Math.max(4, level * 16)}px` }}
        className={`group flex items-center justify-between rounded-lg py-1.5 pr-2 cursor-pointer transition-colors ${
          isSelected
            ? 'bg-sky-100/90 text-sky-950 font-medium'
            : 'hover:bg-slate-100/80 text-gray-700'
        }`}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {hasChildren ? (
            <button
              type="button"
              onClick={(e) => onToggleExpand(assetKey, e)}
              className="flex h-5 w-5 items-center justify-center rounded text-gray-400 hover:bg-gray-200/60 hover:text-gray-700"
            >
              {isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </button>
          ) : (
            <div className="w-5" />
          )}

          {isSubAssembly ? (
            <Layers className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
          ) : (
            <Cpu className="h-3.5 w-3.5 text-slate-600 shrink-0" />
          )}

          <div className="flex items-center gap-2 truncate text-xs">
            <span
              className={`font-mono font-semibold ${
                assetMatched ? 'bg-amber-100 text-amber-900 px-1 rounded' : 'text-gray-900'
              }`}
            >
              {asset.asset_id}
            </span>
            <span className="text-gray-700 truncate text-[11px] font-medium">
              {asset.name}
            </span>
          </div>
        </div>

        {/* Badges & Quick Action */}
        <div className="flex items-center gap-1.5 shrink-0">
          {asset.priority <= 2 && (
            <span
              className={`rounded px-1.5 py-0.2 text-[9px] font-semibold border ${priorityBadge.bg}`}
            >
              {priorityBadge.label}
            </span>
          )}

          <span
            className={`rounded px-1.5 py-0.2 text-[9px] font-semibold border ${statusBadge.bg}`}
          >
            {statusBadge.label}
          </span>

          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAddAsset(siteId, locationId || undefined, asset.asset_id);
              }}
              title="Add Sub-Assembly to this Asset"
              className="flex h-5 items-center gap-0.5 rounded bg-white border border-gray-200 px-1 text-[9px] font-medium text-gray-600 hover:bg-gray-50"
            >
              <Plus className="h-2.5 w-2.5" />
              <span>Sub-Assembly</span>
            </button>
          </div>
        </div>
      </div>

      {/* Child Sub-assemblies */}
      {isExpanded && hasChildren && (
        <div className="space-y-0.5">
          {asset.children?.map((childAsset) => (
            <AssetTreeNode
              key={childAsset.asset_id}
              asset={childAsset}
              siteId={siteId}
              locationId={locationId}
              expandedKeys={expandedKeys}
              onToggleExpand={onToggleExpand}
              selectedNode={selectedNode}
              onSelectNode={onSelectNode}
              search={search}
              isMatch={isMatch}
              onAddAsset={onAddAsset}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Right Inspector Panel Component
// ============================================================================

interface InspectorPanelProps {
  selectedNode: SelectedNodeType;
  onEditLocation: (location: Location) => void;
  onDeleteLocation: (siteId: string, locationId: string) => void;
  onAddSubLocation: (siteId: string, parentLocationId: string) => void;
  onEditAsset: (asset: Asset) => void;
  onDeleteAsset: (siteId: string, assetId: string) => void;
  onAddSubAsset: (siteId: string, locationId?: string | null, parentAssetId?: string) => void;
  onSelectChildNode: (node: SelectedNodeType) => void;
}

const InspectorPanel: React.FC<InspectorPanelProps> = ({
  selectedNode,
  onEditLocation,
  onDeleteLocation,
  onAddSubLocation,
  onEditAsset,
  onDeleteAsset,
  onAddSubAsset,
  onSelectChildNode,
}) => {
  if (selectedNode.kind === 'site') {
    const site = selectedNode.data;
    return (
      <div className="flex flex-col gap-4">
        {/* Header */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
              <Building2 className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold text-gray-900">
                  {site.site_id}
                </span>
                <span className="rounded bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 text-[10px] font-semibold">
                  {site.status}
                </span>
              </div>
              <p className="text-xs text-gray-600 truncate">{site.site_name}</p>
            </div>
          </div>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-gray-200/80 bg-white p-3 text-center">
            <span className="text-[10px] font-medium text-gray-500 uppercase">
              Total Locations
            </span>
            <p className="text-lg font-bold text-gray-900 mt-0.5">
              {site.total_locations}
            </p>
          </div>
          <div className="rounded-lg border border-gray-200/80 bg-white p-3 text-center">
            <span className="text-[10px] font-medium text-gray-500 uppercase">
              Total Assets
            </span>
            <p className="text-lg font-bold text-gray-900 mt-0.5">
              {site.total_assets}
            </p>
          </div>
        </div>

        {/* Site Details Card */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">
            Site Information
          </h4>
          <dl className="grid grid-cols-2 gap-y-2.5 text-xs">
            <div>
              <dt className="text-gray-400 text-[10px]">Site ID</dt>
              <dd className="font-mono font-semibold text-gray-800">{site.site_id}</dd>
            </div>
            <div>
              <dt className="text-gray-400 text-[10px]">Organization</dt>
              <dd className="font-mono font-semibold text-gray-800">{site.org_id}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-gray-400 text-[10px]">Description / Name</dt>
              <dd className="text-gray-700">{site.site_name}</dd>
            </div>
          </dl>
        </div>
      </div>
    );
  }

  if (selectedNode.kind === 'location') {
    const loc = selectedNode.data;
    const typeBadge = getLocationTypeBadge(loc.type);
    const statusBadge = getStatusBadge(loc.status);

    return (
      <div className="flex flex-col gap-4">
        {/* Location Header */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-2xs">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-100 text-sky-700 shrink-0">
                <MapPin className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold text-gray-900">
                    {loc.location_id}
                  </span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[9px] font-semibold border ${typeBadge.bg}`}
                  >
                    {typeBadge.label}
                  </span>
                </div>
                <p className="text-xs text-gray-600 truncate">{loc.description || 'No description'}</p>
              </div>
            </div>

            <span
              className={`rounded px-2 py-0.5 text-[10px] font-semibold border ${statusBadge.bg}`}
            >
              {statusBadge.label}
            </span>
          </div>

          {/* Action Bar */}
          <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => onAddSubLocation(selectedNode.siteId, loc.location_id)}
              className="flex h-7 items-center gap-1 rounded-md bg-sky-50 border border-sky-200/80 px-2 text-[11px] font-semibold text-sky-700 hover:bg-sky-100 transition-colors"
            >
              <Plus className="h-3 w-3" />
              <span>+ Sub-Location</span>
            </button>

            <button
              onClick={() => onAddSubAsset(selectedNode.siteId, loc.location_id, undefined)}
              className="flex h-7 items-center gap-1 rounded-md bg-slate-50 border border-gray-200 px-2 text-[11px] font-semibold text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <Plus className="h-3 w-3" />
              <span>+ Install Asset</span>
            </button>

            <button
              onClick={() => onEditLocation(loc as Location)}
              className="flex h-7 items-center gap-1 rounded-md border border-gray-200 bg-white px-2 text-[11px] font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Edit2 className="h-3 w-3 text-gray-400" />
              <span>Edit</span>
            </button>

            <button
              onClick={() => onDeleteLocation(selectedNode.siteId, loc.location_id)}
              className="flex h-7 w-7 items-center justify-center rounded-md border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 transition-colors ml-auto"
              title="Delete Location"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Location Properties Grid */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">
            Location Specifications
          </h4>
          <dl className="grid grid-cols-2 gap-y-2.5 text-xs">
            <div>
              <dt className="text-gray-400 text-[10px]">Site</dt>
              <dd className="font-mono font-semibold text-gray-800">{loc.site_id}</dd>
            </div>
            <div>
              <dt className="text-gray-400 text-[10px]">Organization</dt>
              <dd className="font-mono font-semibold text-gray-800">{loc.org_id}</dd>
            </div>
            <div>
              <dt className="text-gray-400 text-[10px]">Parent Location</dt>
              <dd className="font-mono font-medium text-gray-700">
                {loc.parent_location_id || 'Root Level'}
              </dd>
            </div>
            <div>
              <dt className="text-gray-400 text-[10px]">GL Account</dt>
              <dd className="font-mono text-gray-700">{loc.gl_account || '—'}</dd>
            </div>
            <div>
              <dt className="text-gray-400 text-[10px]">Location Type</dt>
              <dd className="text-gray-800 font-medium">{loc.type}</dd>
            </div>
            <div>
              <dt className="text-gray-400 text-[10px]">Operating Status</dt>
              <dd className="text-gray-800 font-medium">{loc.status}</dd>
            </div>
          </dl>
        </div>

        {/* Dynamic Enterprise Specifications */}
        <InstanceSpecificationsInspector
          targetType="location"
          siteId={selectedNode.siteId}
          instanceId={loc.location_id}
        />

        {/* Direct Sub-locations List */}
        {loc.children_locations && loc.children_locations.length > 0 && (
          <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">
              Child Locations ({loc.children_locations.length})
            </h4>
            <div className="space-y-1">
              {loc.children_locations.map((cLoc) => (
                <div
                  key={cLoc.location_id}
                  onClick={() =>
                    onSelectChildNode({
                      kind: 'location',
                      data: cLoc,
                      siteId: selectedNode.siteId,
                    })
                  }
                  className="flex items-center justify-between rounded-md p-2 hover:bg-slate-50 cursor-pointer border border-transparent hover:border-gray-200 text-xs transition-colors"
                >
                  <div className="flex items-center gap-1.5 truncate">
                    <MapPin className="h-3 w-3 text-sky-600" />
                    <span className="font-mono font-semibold text-gray-800">
                      {cLoc.location_id}
                    </span>
                    <span className="text-gray-500 truncate text-[11px]">
                      {cLoc.description}
                    </span>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Installed Assets List */}
        {loc.assets && loc.assets.length > 0 && (
          <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">
              Installed Assets ({loc.assets.length})
            </h4>
            <div className="space-y-1">
              {loc.assets.map((ast) => (
                <div
                  key={ast.asset_id}
                  onClick={() =>
                    onSelectChildNode({
                      kind: 'asset',
                      data: ast,
                      siteId: selectedNode.siteId,
                      locationId: loc.location_id,
                    })
                  }
                  className="flex items-center justify-between rounded-md p-2 hover:bg-slate-50 cursor-pointer border border-transparent hover:border-gray-200 text-xs transition-colors"
                >
                  <div className="flex items-center gap-1.5 truncate">
                    <Cpu className="h-3 w-3 text-slate-600" />
                    <span className="font-mono font-semibold text-gray-800">
                      {ast.asset_id}
                    </span>
                    <span className="text-gray-600 truncate text-[11px]">
                      {ast.name}
                    </span>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (selectedNode.kind === 'asset') {
    const asset = selectedNode.data;
    const statusBadge = getStatusBadge(asset.status);
    const priorityBadge = getPriorityBadge(asset.priority);
    const isSubAssembly = Boolean(asset.parent_asset_id);

    return (
      <div className="flex flex-col gap-4">
        {/* Asset Header */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-2xs">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-lg shrink-0 ${
                  isSubAssembly
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                {isSubAssembly ? (
                  <Layers className="h-4 w-4" />
                ) : (
                  <Cpu className="h-4 w-4" />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold text-gray-900">
                    {asset.asset_id}
                  </span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[9px] font-semibold border ${priorityBadge.bg}`}
                  >
                    {priorityBadge.label}
                  </span>
                </div>
                <p className="text-xs text-gray-700 font-medium truncate">{asset.name}</p>
              </div>
            </div>

            <span
              className={`rounded px-2 py-0.5 text-[10px] font-semibold border ${statusBadge.bg}`}
            >
              {statusBadge.label}
            </span>
          </div>

          {/* Action Bar */}
          <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap items-center gap-1.5">
            <button
              onClick={() =>
                onAddSubAsset(
                  selectedNode.siteId,
                  selectedNode.locationId || undefined,
                  asset.asset_id
                )
              }
              className="flex h-7 items-center gap-1 rounded-md bg-sky-50 border border-sky-200/80 px-2 text-[11px] font-semibold text-sky-700 hover:bg-sky-100 transition-colors"
            >
              <Plus className="h-3 w-3" />
              <span>+ Sub-Assembly</span>
            </button>

            <button
              onClick={() => onEditAsset(asset as Asset)}
              className="flex h-7 items-center gap-1 rounded-md border border-gray-200 bg-white px-2 text-[11px] font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Edit2 className="h-3 w-3 text-gray-400" />
              <span>Edit</span>
            </button>

            <button
              onClick={() => onDeleteAsset(selectedNode.siteId, asset.asset_id)}
              className="flex h-7 w-7 items-center justify-center rounded-md border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 transition-colors ml-auto"
              title="Delete Asset"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Technical & Lineage Specifications */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">
            Asset Specifications & Lineage
          </h4>
          <dl className="grid grid-cols-2 gap-y-2.5 text-xs">
            <div>
              <dt className="text-gray-400 text-[10px]">Site</dt>
              <dd className="font-mono font-semibold text-gray-800">{asset.site_id}</dd>
            </div>
            <div>
              <dt className="text-gray-400 text-[10px]">Organization</dt>
              <dd className="font-mono font-semibold text-gray-800">{asset.org_id}</dd>
            </div>
            <div>
              <dt className="text-gray-400 text-[10px]">Current Location</dt>
              <dd className="font-mono font-medium text-sky-800">
                {asset.location_id || 'Unassigned / Staging'}
              </dd>
            </div>
            <div>
              <dt className="text-gray-400 text-[10px]">Parent Asset</dt>
              <dd className="font-mono font-medium text-indigo-800">
                {asset.parent_asset_id || 'Top-Level Machine'}
              </dd>
            </div>
            <div>
              <dt className="text-gray-400 text-[10px]">Item Num (Rotating)</dt>
              <dd className="font-mono text-gray-700">{asset.item_num || '—'}</dd>
            </div>
            <div>
              <dt className="text-gray-400 text-[10px]">Serial Number</dt>
              <dd className="font-mono text-gray-700">{asset.serial_num || '—'}</dd>
            </div>
            <div>
              <dt className="text-gray-400 text-[10px]">Manufacturer</dt>
              <dd className="text-gray-800">{asset.manufacturer || '—'}</dd>
            </div>
            <div>
              <dt className="text-gray-400 text-[10px]">Model</dt>
              <dd className="text-gray-800">{asset.model || '—'}</dd>
            </div>
            <div>
              <dt className="text-gray-400 text-[10px]">Vendor</dt>
              <dd className="font-mono text-gray-700">{asset.vendor || '—'}</dd>
            </div>
            <div>
              <dt className="text-gray-400 text-[10px]">Purchase Cost</dt>
              <dd className="font-semibold text-emerald-700">
                ${Number(asset.purchase_cost || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </dd>
            </div>
            {asset.description && (
              <div className="col-span-2 pt-1 border-t border-gray-100">
                <dt className="text-gray-400 text-[10px]">Description</dt>
                <dd className="text-gray-700 mt-0.5">{asset.description}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* Dynamic Enterprise Specifications */}
        <InstanceSpecificationsInspector
          targetType="asset"
          siteId={selectedNode.siteId}
          instanceId={asset.asset_id}
        />

        {/* Sub-Assemblies List */}
        {asset.children && asset.children.length > 0 && (
          <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">
              Child Sub-Assemblies ({asset.children.length})
            </h4>
            <div className="space-y-1">
              {asset.children.map((subAst) => (
                <div
                  key={subAst.asset_id}
                  onClick={() =>
                    onSelectChildNode({
                      kind: 'asset',
                      data: subAst,
                      siteId: selectedNode.siteId,
                      locationId: selectedNode.locationId,
                    })
                  }
                  className="flex items-center justify-between rounded-md p-2 hover:bg-slate-50 cursor-pointer border border-transparent hover:border-gray-200 text-xs transition-colors"
                >
                  <div className="flex items-center gap-1.5 truncate">
                    <Layers className="h-3 w-3 text-indigo-500" />
                    <span className="font-mono font-semibold text-gray-800">
                      {subAst.asset_id}
                    </span>
                    <span className="text-gray-600 truncate text-[11px]">
                      {subAst.name}
                    </span>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
};

// ============================================================================
// Location Create / Edit Modal Dialog
// ============================================================================

interface LocationModalProps {
  mode: 'create' | 'edit';
  initialData: Partial<Location>;
  sites: Site[];
  onClose: () => void;
  onSaved: () => void;
}

const LocationModal: React.FC<LocationModalProps> = ({
  mode,
  initialData,
  sites,
  onClose,
  onSaved,
}) => {
  const [siteId, setSiteId] = useState(initialData.site_id || sites[0]?.site_id || 'BEDFORD');
  const [locationId, setLocationId] = useState(initialData.location_id || '');
  const [parentLocationId, setParentLocationId] = useState(initialData.parent_location_id || '');
  const [description, setDescription] = useState(initialData.description || '');
  const [type, setType] = useState<LocationType>(initialData.type || 'OPERATING');
  const [status, setStatus] = useState<LocationStatus>(initialData.status || 'OPERATING');
  const [glAccount, setGlAccount] = useState(initialData.gl_account || '');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Available parent locations in selected site
  const [availableLocations, setAvailableLocations] = useState<Location[]>([]);

  useEffect(() => {
    if (siteId) {
      api.listLocations({ site_id: siteId }).then((locs) => {
        setAvailableLocations(locs.filter((l) => l.location_id !== locationId));
      });
    }
  }, [siteId, locationId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!locationId.trim() || !siteId) return;

    setSaving(true);
    setError(null);
    try {
      if (mode === 'create') {
        await api.createLocation({
          location_id: locationId.trim().toUpperCase(),
          site_id: siteId,
          parent_location_id: parentLocationId.trim() ? parentLocationId.trim().toUpperCase() : null,
          description: description.trim() || undefined,
          type,
          status,
          gl_account: glAccount.trim() || undefined,
        });
      } else {
        await api.updateLocation(initialData.site_id!, initialData.location_id!, {
          description: description.trim() || undefined,
          parent_location_id: parentLocationId.trim() ? parentLocationId.trim().toUpperCase() : null,
          type,
          status,
          gl_account: glAccount.trim() || undefined,
        });
      }
      onSaved();
    } catch (err: any) {
      setError(err?.message || 'Failed to save location.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-gray-200 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
              <MapPin className="h-4 w-4" />
            </div>
            <h3 className="text-sm font-bold text-gray-900">
              {mode === 'create' ? 'Create New Location' : `Edit Location: ${initialData.location_id}`}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-rose-50 border border-rose-200 p-3 text-rose-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Site <span className="text-rose-500">*</span>
              </label>
              <select
                value={siteId}
                disabled={mode === 'edit'}
                onChange={(e) => setSiteId(e.target.value)}
                className="h-8 w-full rounded-lg border border-gray-200 bg-white px-2.5 text-xs text-gray-800 disabled:bg-gray-100 focus:border-sky-500 focus:outline-none"
              >
                {sites.map((s) => (
                  <option key={s.site_id} value={s.site_id}>
                    {s.site_id} ({s.name})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Location ID <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                disabled={mode === 'edit'}
                placeholder="e.g. MECH_ROOM_102"
                value={locationId}
                onChange={(e) => setLocationId(e.target.value.toUpperCase())}
                className="h-8 w-full font-mono rounded-lg border border-gray-200 bg-white px-2.5 text-xs text-gray-800 disabled:bg-gray-100 focus:border-sky-500 focus:outline-none"
                required
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-gray-700 mb-1">
              Description / Area Name
            </label>
            <input
              type="text"
              placeholder="e.g. Secondary Mechanical & Pump Room"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="h-8 w-full rounded-lg border border-gray-200 bg-white px-2.5 text-xs text-gray-800 focus:border-sky-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Parent Location (Hierarchy)
              </label>
              <select
                value={parentLocationId}
                onChange={(e) => setParentLocationId(e.target.value)}
                className="h-8 w-full rounded-lg border border-gray-200 bg-white px-2.5 text-xs text-gray-800 focus:border-sky-500 focus:outline-none"
              >
                <option value="">(None - Top Level Location)</option>
                {availableLocations.map((l) => (
                  <option key={l.location_id} value={l.location_id}>
                    {l.location_id} - {l.description || l.type}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Location Type
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as LocationType)}
                className="h-8 w-full rounded-lg border border-gray-200 bg-white px-2.5 text-xs text-gray-800 focus:border-sky-500 focus:outline-none"
              >
                <option value="OPERATING">OPERATING (Production/Work Area)</option>
                <option value="STOREROOM">STOREROOM (Spare Parts/Inventory)</option>
                <option value="HOLDING">HOLDING (Receiving/Staging)</option>
                <option value="SALVAGE">SALVAGE (Scrap/Decommission)</option>
                <option value="VENDOR">VENDOR (External Supplier/Repair)</option>
                <option value="REPAIR">REPAIR (Maintenance Shop)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Operating Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as LocationStatus)}
                className="h-8 w-full rounded-lg border border-gray-200 bg-white px-2.5 text-xs text-gray-800 focus:border-sky-500 focus:outline-none"
              >
                <option value="OPERATING">OPERATING</option>
                <option value="NOT_READY">NOT READY</option>
                <option value="DECOMMISSIONED">DECOMMISSIONED</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                GL Account Code
              </label>
              <input
                type="text"
                placeholder="e.g. 6100-003"
                value={glAccount}
                onChange={(e) => setGlAccount(e.target.value)}
                className="h-8 w-full font-mono rounded-lg border border-gray-200 bg-white px-2.5 text-xs text-gray-800 focus:border-sky-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="h-8 rounded-lg border border-gray-200 px-4 text-xs font-semibold text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex h-8 items-center gap-1.5 rounded-lg bg-sky-700 px-4 text-xs font-semibold text-white hover:bg-sky-800 disabled:opacity-50"
            >
              {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              <span>{mode === 'create' ? 'Create Location' : 'Save Changes'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ============================================================================
// Asset Create / Edit Modal Dialog
// ============================================================================

interface AssetModalProps {
  mode: 'create' | 'edit';
  initialData: Partial<Asset>;
  sites: Site[];
  onClose: () => void;
  onSaved: () => void;
}

const AssetModal: React.FC<AssetModalProps> = ({
  mode,
  initialData,
  sites,
  onClose,
  onSaved,
}) => {
  const [siteId, setSiteId] = useState(initialData.site_id || sites[0]?.site_id || 'BEDFORD');
  const [assetId, setAssetId] = useState(initialData.asset_id || '');
  const [name, setName] = useState(initialData.name || '');
  const [description, setDescription] = useState(initialData.description || '');
  const [locationId, setLocationId] = useState(initialData.location_id || '');
  const [parentAssetId, setParentAssetId] = useState(initialData.parent_asset_id || '');
  const [itemNum, setItemNum] = useState(initialData.item_num || '');
  const [serialNum, setSerialNum] = useState(initialData.serial_num || '');
  const [status, setStatus] = useState<AssetStatus>(initialData.status || 'OPERATING');
  const [vendor, setVendor] = useState(initialData.vendor || '');
  const [manufacturer, setManufacturer] = useState(initialData.manufacturer || '');
  const [model, setModel] = useState(initialData.model || '');
  const [purchaseCost, setPurchaseCost] = useState<number>(initialData.purchase_cost || 0);
  const [priority, setPriority] = useState<number>(initialData.priority || 3);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Available locations & assets for parent dropdowns in selected site
  const [availableLocations, setAvailableLocations] = useState<Location[]>([]);
  const [availableAssets, setAvailableAssets] = useState<Asset[]>([]);

  useEffect(() => {
    if (siteId) {
      Promise.all([
        api.listLocations({ site_id: siteId }),
        api.listAssets({ site_id: siteId }),
      ]).then(([locs, asts]) => {
        setAvailableLocations(locs);
        setAvailableAssets(asts.filter((a) => a.asset_id !== assetId));
      });
    }
  }, [siteId, assetId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assetId.trim() || !name.trim() || !siteId) return;

    setSaving(true);
    setError(null);
    try {
      if (mode === 'create') {
        await api.createAsset({
          asset_id: assetId.trim().toUpperCase(),
          site_id: siteId,
          name: name.trim(),
          description: description.trim() || undefined,
          location_id: locationId.trim() ? locationId.trim().toUpperCase() : null,
          parent_asset_id: parentAssetId.trim() ? parentAssetId.trim().toUpperCase() : null,
          item_num: itemNum.trim() || undefined,
          serial_num: serialNum.trim() || undefined,
          status,
          vendor: vendor.trim() || undefined,
          manufacturer: manufacturer.trim() || undefined,
          model: model.trim() || undefined,
          purchase_cost: Number(purchaseCost) || 0,
          priority: Number(priority) || 3,
        });
      } else {
        await api.updateAsset(initialData.site_id!, initialData.asset_id!, {
          name: name.trim(),
          description: description.trim() || undefined,
          location_id: locationId.trim() ? locationId.trim().toUpperCase() : null,
          parent_asset_id: parentAssetId.trim() ? parentAssetId.trim().toUpperCase() : null,
          item_num: itemNum.trim() || undefined,
          serial_num: serialNum.trim() || undefined,
          status,
          vendor: vendor.trim() || undefined,
          manufacturer: manufacturer.trim() || undefined,
          model: model.trim() || undefined,
          purchase_cost: Number(purchaseCost) || 0,
          priority: Number(priority) || 3,
        });
      }
      onSaved();
    } catch (err: any) {
      setError(err?.message || 'Failed to save asset.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl border border-gray-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
              <Cpu className="h-4 w-4" />
            </div>
            <h3 className="text-sm font-bold text-gray-900">
              {mode === 'create' ? 'Create New Asset' : `Edit Asset: ${initialData.asset_id}`}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs overflow-y-auto flex-1">
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-rose-50 border border-rose-200 p-3 text-rose-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Site <span className="text-rose-500">*</span>
              </label>
              <select
                value={siteId}
                disabled={mode === 'edit'}
                onChange={(e) => setSiteId(e.target.value)}
                className="h-8 w-full rounded-lg border border-gray-200 bg-white px-2.5 text-xs text-gray-800 disabled:bg-gray-100 focus:border-sky-500 focus:outline-none"
              >
                {sites.map((s) => (
                  <option key={s.site_id} value={s.site_id}>
                    {s.site_id} ({s.name})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Asset ID <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                disabled={mode === 'edit'}
                placeholder="e.g. PUMP_101"
                value={assetId}
                onChange={(e) => setAssetId(e.target.value.toUpperCase())}
                className="h-8 w-full font-mono rounded-lg border border-gray-200 bg-white px-2.5 text-xs text-gray-800 disabled:bg-gray-100 focus:border-sky-500 focus:outline-none"
                required
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-gray-700 mb-1">
              Asset Name / Title <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. High Pressure Feedwater Pump"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-8 w-full rounded-lg border border-gray-200 bg-white px-2.5 text-xs text-gray-800 focus:border-sky-500 focus:outline-none"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Installed Location
              </label>
              <select
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                className="h-8 w-full rounded-lg border border-gray-200 bg-white px-2.5 text-xs text-gray-800 focus:border-sky-500 focus:outline-none"
              >
                <option value="">(None - Staged / Unassigned)</option>
                {availableLocations.map((l) => (
                  <option key={l.location_id} value={l.location_id}>
                    {l.location_id} ({l.description || l.type})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Parent Asset (Sub-Assembly Hierarchy)
              </label>
              <select
                value={parentAssetId}
                onChange={(e) => setParentAssetId(e.target.value)}
                className="h-8 w-full rounded-lg border border-gray-200 bg-white px-2.5 text-xs text-gray-800 focus:border-sky-500 focus:outline-none"
              >
                <option value="">(None - Top Level Machine)</option>
                {availableAssets.map((a) => (
                  <option key={a.asset_id} value={a.asset_id}>
                    {a.asset_id} - {a.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as AssetStatus)}
                className="h-8 w-full rounded-lg border border-gray-200 bg-white px-2.5 text-xs text-gray-800 focus:border-sky-500 focus:outline-none"
              >
                <option value="OPERATING">OPERATING</option>
                <option value="NOT_READY">NOT READY</option>
                <option value="IN_REPAIR">IN REPAIR</option>
                <option value="DECOMMISSIONED">DECOMMISSIONED</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value))}
                className="h-8 w-full rounded-lg border border-gray-200 bg-white px-2.5 text-xs text-gray-800 focus:border-sky-500 focus:outline-none"
              >
                <option value={1}>P1 - Critical</option>
                <option value={2}>P2 - High</option>
                <option value={3}>P3 - Medium</option>
                <option value={4}>P4 - Low</option>
                <option value={5}>P5 - Informational</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Purchase Cost ($)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={purchaseCost}
                onChange={(e) => setPurchaseCost(parseFloat(e.target.value) || 0)}
                className="h-8 w-full rounded-lg border border-gray-200 bg-white px-2.5 text-xs text-gray-800 focus:border-sky-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Rotating Item Num
              </label>
              <input
                type="text"
                placeholder="e.g. PUMP-CENT-01"
                value={itemNum}
                onChange={(e) => setItemNum(e.target.value)}
                className="h-8 w-full font-mono rounded-lg border border-gray-200 bg-white px-2.5 text-xs text-gray-800 focus:border-sky-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Serial Number
              </label>
              <input
                type="text"
                placeholder="e.g. SN-8821-X"
                value={serialNum}
                onChange={(e) => setSerialNum(e.target.value)}
                className="h-8 w-full font-mono rounded-lg border border-gray-200 bg-white px-2.5 text-xs text-gray-800 focus:border-sky-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Manufacturer
              </label>
              <input
                type="text"
                placeholder="e.g. Flowserve"
                value={manufacturer}
                onChange={(e) => setManufacturer(e.target.value)}
                className="h-8 w-full rounded-lg border border-gray-200 bg-white px-2.5 text-xs text-gray-800 focus:border-sky-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Model
              </label>
              <input
                type="text"
                placeholder="e.g. HPX-200"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="h-8 w-full rounded-lg border border-gray-200 bg-white px-2.5 text-xs text-gray-800 focus:border-sky-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Vendor
              </label>
              <input
                type="text"
                placeholder="e.g. FLOWSERVE"
                value={vendor}
                onChange={(e) => setVendor(e.target.value.toUpperCase())}
                className="h-8 w-full font-mono rounded-lg border border-gray-200 bg-white px-2.5 text-xs text-gray-800 focus:border-sky-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-gray-700 mb-1">
              Detailed Description / Notes
            </label>
            <textarea
              rows={2}
              placeholder="Technical specs, operating parameters..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white p-2 text-xs text-gray-800 focus:border-sky-500 focus:outline-none"
            />
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="h-8 rounded-lg border border-gray-200 px-4 text-xs font-semibold text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex h-8 items-center gap-1.5 rounded-lg bg-sky-700 px-4 text-xs font-semibold text-white hover:bg-sky-800 disabled:opacity-50"
            >
              {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              <span>{mode === 'create' ? 'Create Asset' : 'Save Changes'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
