import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  FolderTree,
  ChevronRight,
  ChevronDown,
  Plus,
  RefreshCw,
  Search,
  Tag,
  Layers,
  Edit2,
  Trash2,
  Check,
  X,
  AlertCircle,
  Sliders,
  ArrowRight,
  Building2,
  MapPin,
  Cpu,
  Database,
  Filter,
  ExternalLink,
  BookOpen,
  ListFilter,
  CheckCircle2,
} from 'lucide-react';
import { api } from '../../api/client';
import type {
  Classification,
  ClassificationTreeNode,
  ClassSpec,
  SpecDataType,
  Asset,
  Location,
  AssetAttribute,
  AttributeInstancesSearchResult,
} from '../../types';
import { InfoTooltip } from '../people/InfoTooltip';

interface ClassificationsViewProps {
  onNavigateToAsset?: (siteId: string, assetId: string) => void;
  onNavigateToLocation?: (siteId: string, locationId: string) => void;
}

const getDataTypeBadge = (type: SpecDataType | string) => {
  switch (type?.toUpperCase()) {
    case 'NUMERIC':
      return { bg: 'bg-blue-50 text-blue-700 border-blue-200/70', label: 'Numeric' };
    case 'ALN':
      return { bg: 'bg-slate-100 text-slate-700 border-slate-200', label: 'Alphanumeric' };
    case 'DATE':
      return { bg: 'bg-purple-50 text-purple-700 border-purple-200/70', label: 'Date/Time' };
    case 'YORN':
      return { bg: 'bg-amber-50 text-amber-700 border-amber-200/70', label: 'Yes/No' };
    case 'TABLE':
      return { bg: 'bg-emerald-50 text-emerald-700 border-emerald-200/70', label: 'Lookup Table' };
    default:
      return { bg: 'bg-gray-100 text-gray-600 border-gray-200', label: type || 'ALN' };
  }
};

const STANDARD_SECTIONS = [
  'General',
  'Mechanical',
  'Electrical',
  'Hydraulics',
  'Thermal',
  'Physical Dimension',
  'Safety & Compliance',
  'Environmental',
  'Maintenance',
  'Security',
  'Occupancy',
];

export const ClassificationsView: React.FC<ClassificationsViewProps> = ({
  onNavigateToAsset,
  onNavigateToLocation,
}) => {
  // Main view tabs: 'taxonomy' | 'catalog' | 'search'
  const [activeTab, setActiveTab] = useState<'taxonomy' | 'catalog' | 'search'>('taxonomy');

  // Taxonomy & Tree state
  const [treeNodes, setTreeNodes] = useState<ClassificationTreeNode[]>([]);
  const [flatList, setFlatList] = useState<Classification[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [useWithFilter, setUseWithFilter] = useState<'ALL' | 'ASSET' | 'LOCATIONS'>('ALL');
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Selected Classification Detail State
  const [selectedClassification, setSelectedClassification] = useState<Classification | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Classified instances list
  const [classifiedAssets, setClassifiedAssets] = useState<Asset[]>([]);
  const [classifiedLocations, setClassifiedLocations] = useState<Location[]>([]);

  // Master Attribute Catalog state
  const [masterAttributes, setMasterAttributes] = useState<AssetAttribute[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogTypeFilter, setCatalogTypeFilter] = useState<string>('ALL');

  // Cross-Fleet Attribute Search state
  const [searchAttrId, setSearchAttrId] = useState<string>('FLOW_RATE');
  const [searchMinNum, setSearchMinNum] = useState<string>('');
  const [searchMaxNum, setSearchMaxNum] = useState<string>('');
  const [searchAlnMatch, setSearchAlnMatch] = useState<string>('');
  const [searchExactAln, setSearchExactAln] = useState<string>('');
  const [searchSiteId, setSearchSiteId] = useState<string>('');
  const [searchEntityType, setSearchEntityType] = useState<'ALL' | 'ASSET' | 'LOCATION'>('ALL');
  const [searchResult, setSearchResult] = useState<AttributeInstancesSearchResult | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);

  // Modals
  const [isClassModalOpen, setIsClassModalOpen] = useState(false);
  const [classModalMode, setClassModalMode] = useState<'create' | 'edit'>('create');
  const [editingClass, setEditingClass] = useState<Partial<Classification> | null>(null);

  const [isAttrModalOpen, setIsAttrModalOpen] = useState(false);
  const [attrModalMode, setAttrModalMode] = useState<'create' | 'edit'>('create');
  const [editingAttr, setEditingAttr] = useState<Partial<ClassSpec> | null>(null);

  const [isMasterAttrModalOpen, setIsMasterAttrModalOpen] = useState(false);
  const [masterAttrModalMode, setMasterAttrModalMode] = useState<'create' | 'edit'>('create');
  const [editingMasterAttr, setEditingMasterAttr] = useState<Partial<AssetAttribute> | null>(null);

  // Fetch Tree & Flat List
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [tree, flat, catalog] = await Promise.all([
        api.getClassificationTree({
          use_with: useWithFilter === 'ALL' ? undefined : useWithFilter,
        }),
        api.listClassifications({
          use_with: useWithFilter === 'ALL' ? undefined : useWithFilter,
        }),
        api.listMasterAttributes(),
      ]);
      setTreeNodes(tree);
      setFlatList(flat);
      setMasterAttributes(catalog);

      // Default expand top levels
      const allKeys = new Set<string>();
      const collectKeys = (nodes: ClassificationTreeNode[]) => {
        for (const n of nodes) {
          allKeys.add(n.classstructure_id);
          if (n.children && n.children.length > 0) {
            collectKeys(n.children);
          }
        }
      };
      collectKeys(tree);
      setExpandedKeys(allKeys);

      // Select first node if none selected
      if (!selectedId && tree.length > 0) {
        setSelectedId(tree[0].classstructure_id);
      }
    } catch (err) {
      console.error('Failed to load classifications:', err);
    } finally {
      setLoading(false);
    }
  }, [useWithFilter, selectedId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Fetch Master Catalog on tab switch
  const fetchCatalog = useCallback(async () => {
    setCatalogLoading(true);
    try {
      const catalog = await api.listMasterAttributes();
      setMasterAttributes(catalog);
    } catch (err) {
      console.error('Failed to load master attribute catalog:', err);
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'catalog') {
      fetchCatalog();
    }
  }, [activeTab, fetchCatalog]);

  // Execute Cross-Fleet Search
  const handleExecuteSearch = useCallback(async () => {
    if (!searchAttrId) return;
    setSearchLoading(true);
    try {
      const res = await api.searchAttributeInstances(searchAttrId, {
        min_num: searchMinNum ? parseFloat(searchMinNum) : undefined,
        max_num: searchMaxNum ? parseFloat(searchMaxNum) : undefined,
        aln_match: searchAlnMatch.trim() || undefined,
        exact_aln: searchExactAln.trim() || undefined,
        site_id: searchSiteId.trim() || undefined,
        entity_type: searchEntityType,
      });
      setSearchResult(res);
    } catch (err) {
      console.error('Cross-fleet attribute search failed:', err);
    } finally {
      setSearchLoading(false);
    }
  }, [searchAttrId, searchMinNum, searchMaxNum, searchAlnMatch, searchExactAln, searchSiteId, searchEntityType]);

  useEffect(() => {
    if (activeTab === 'search') {
      handleExecuteSearch();
    }
  }, [activeTab, searchAttrId, handleExecuteSearch]);

  // Fetch Selected Classification Details & Associated Instances
  const fetchSelectedDetail = useCallback(async (csId: string) => {
    setDetailLoading(true);
    try {
      const [clsDetail, allAssets, allLocs] = await Promise.all([
        api.getClassification(csId),
        api.listAssets(),
        api.listLocations(),
      ]);
      setSelectedClassification(clsDetail);
      setClassifiedAssets(allAssets.filter((a) => a.classstructure_id === csId));
      setClassifiedLocations(allLocs.filter((l) => l.classstructure_id === csId));
    } catch (err) {
      console.error('Failed to load classification details:', err);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) {
      fetchSelectedDetail(selectedId);
    } else {
      setSelectedClassification(null);
    }
  }, [selectedId, fetchSelectedDetail]);

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

  const expandAll = () => {
    const all = new Set<string>();
    const collect = (nodes: ClassificationTreeNode[]) => {
      for (const n of nodes) {
        all.add(n.classstructure_id);
        if (n.children) collect(n.children);
      }
    };
    collect(treeNodes);
    setExpandedKeys(all);
  };

  const collapseAll = () => {
    setExpandedKeys(new Set());
  };

  const handleDeleteClassification = async (csId: string) => {
    if (!window.confirm(`Are you sure you want to delete Classification "${csId}"?`)) {
      return;
    }
    try {
      await api.deleteClassification(csId);
      if (selectedId === csId) {
        setSelectedId(null);
      }
      await fetchData();
    } catch (err: any) {
      alert(err.message || 'Failed to delete classification. Please check for child classifications.');
    }
  };

  const handleDeleteAttribute = async (csId: string, attrId: string) => {
    if (!window.confirm(`Are you sure you want to remove attribute template "${attrId}"?`)) {
      return;
    }
    try {
      await api.deleteClassificationAttribute(csId, attrId);
      await fetchSelectedDetail(csId);
      await fetchCatalog();
    } catch (err: any) {
      alert(err.message || 'Failed to delete attribute.');
    }
  };

  const handleDeleteMasterAttribute = async (attrId: string) => {
    if (!window.confirm(`Are you sure you want to delete Master Attribute "${attrId}" from catalog?`)) {
      return;
    }
    try {
      await api.deleteMasterAttribute(attrId);
      await fetchCatalog();
    } catch (err: any) {
      alert(err.message || 'Cannot delete master attribute while referenced in classifications.');
    }
  };

  // Filter tree nodes by search text
  const isMatch = (text?: string | null) => {
    if (!search.trim()) return true;
    return (text || '').toLowerCase().includes(search.trim().toLowerCase());
  };

  // Grouped attributes by section for selected classification
  const groupedAttributes = useMemo(() => {
    if (!selectedClassification?.all_attributes) return {};
    const groups: Record<string, ClassSpec[]> = {};
    for (const attr of selectedClassification.all_attributes) {
      const sec = attr.section?.trim() || 'General Specifications';
      if (!groups[sec]) groups[sec] = [];
      groups[sec].push(attr);
    }
    return groups;
  }, [selectedClassification]);

  // Filtered Master Catalog
  const filteredCatalog = useMemo(() => {
    return masterAttributes.filter((a) => {
      if (catalogTypeFilter !== 'ALL' && a.data_type !== catalogTypeFilter) {
        return false;
      }
      if (!catalogSearch.trim()) return true;
      const s = catalogSearch.toLowerCase();
      return (
        a.attribute_id.toLowerCase().includes(s) ||
        a.description.toLowerCase().includes(s) ||
        (a.unit_of_measure && a.unit_of_measure.toLowerCase().includes(s))
      );
    });
  }, [masterAttributes, catalogSearch, catalogTypeFilter]);

  return (
    <div className="flex h-full w-full flex-col min-h-0 bg-slate-50/50">
      {/* Top Header & Navigation Sub-Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white px-5 py-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-700 border border-slate-200">
            <FolderTree className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-gray-900">
                Enterprise Classifications & Specifications
              </h2>
              <InfoTooltip text="Unified taxonomy hierarchy, reusable Master Attribute Catalog, and cross-fleet specification queries." />
            </div>
            <p className="text-xs text-gray-500">
              Manage multi-level hierarchies, global attribute dictionaries, section groupings, and equipment search.
            </p>
          </div>
        </div>

        {/* View Mode Sub-Tabs */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
          <button
            type="button"
            onClick={() => setActiveTab('taxonomy')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
              activeTab === 'taxonomy'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FolderTree className="h-3.5 w-3.5" />
            <span>Taxonomy Hierarchy</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('catalog')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
              activeTab === 'catalog'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Database className="h-3.5 w-3.5 text-slate-700" />
            <span>Master Attribute Catalog</span>
            <span className="rounded-full bg-slate-200 px-1.5 py-0.2 text-[10px] font-mono text-slate-700">
              {masterAttributes.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('search')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
              activeTab === 'search'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Search className="h-3.5 w-3.5 text-slate-700" />
            <span>Cross-Fleet Search</span>
          </button>
        </div>

        {/* Global Action */}
        <div className="flex items-center gap-2">
          {activeTab === 'taxonomy' && (
            <button
              type="button"
              onClick={() => {
                setClassModalMode('create');
                setEditingClass({
                  use_with: ['ASSET', 'LOCATIONS'],
                  status: 'ACTIVE',
                });
                setIsClassModalOpen(true);
              }}
              className="flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-sky-700 transition-colors"
            >
              <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
              <span>New Classification</span>
            </button>
          )}

          {activeTab === 'catalog' && (
            <button
              type="button"
              onClick={() => {
                setMasterAttrModalMode('create');
                setEditingMasterAttr({
                  data_type: 'ALN',
                  status: 'ACTIVE',
                });
                setIsMasterAttrModalOpen(true);
              }}
              className="flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-sky-700 transition-colors"
            >
              <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
              <span>Register Master Attribute</span>
            </button>
          )}
        </div>
      </div>

      {/* TAB 1: Taxonomy & Hierarchy Explorer */}
      {activeTab === 'taxonomy' && (
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left Column: Classification Hierarchy Tree */}
          <div className="flex w-80 md:w-96 flex-col border-r border-gray-200 bg-white shrink-0">
            {/* Filter Bar */}
            <div className="p-3 border-b border-gray-100 space-y-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search hierarchy..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-md border border-gray-200 bg-slate-50/50 pl-8 pr-3 py-1.5 text-xs text-gray-800 placeholder-gray-400 focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <div className="flex items-center justify-between gap-1 text-xs">
                <div className="flex items-center gap-1">
                  {(['ALL', 'ASSET', 'LOCATIONS'] as const).map((filter) => (
                    <button
                      key={filter}
                      type="button"
                      onClick={() => setUseWithFilter(filter)}
                      className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                        useWithFilter === filter
                          ? 'bg-sky-100 text-sky-800 font-semibold'
                          : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
                      }`}
                    >
                      {filter === 'ALL' ? 'All' : filter === 'ASSET' ? 'Assets' : 'Locations'}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1 text-[11px] text-gray-400">
                  <button
                    type="button"
                    onClick={expandAll}
                    className="hover:text-gray-700 hover:underline"
                  >
                    Expand
                  </button>
                  <span>·</span>
                  <button
                    type="button"
                    onClick={collapseAll}
                    className="hover:text-gray-700 hover:underline"
                  >
                    Collapse
                  </button>
                </div>
              </div>
            </div>

            {/* Tree Node List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
              {loading ? (
                <div className="flex h-32 items-center justify-center text-xs text-gray-400">
                  <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                  Loading classifications...
                </div>
              ) : treeNodes.length === 0 ? (
                <div className="p-4 text-center text-xs text-gray-400">
                  No classifications found.
                </div>
              ) : (
                treeNodes.map((node) => (
                  <ClassificationTreeNodeItem
                    key={node.classstructure_id}
                    node={node}
                    level={0}
                    expandedKeys={expandedKeys}
                    onToggleExpand={toggleExpand}
                    selectedId={selectedId}
                    onSelect={(id) => setSelectedId(id)}
                    onAddChild={(parent) => {
                      setClassModalMode('create');
                      setEditingClass({
                        parent_classstructure_id: parent.classstructure_id,
                        use_with: parent.use_with || ['ASSET', 'LOCATIONS'],
                        status: 'ACTIVE',
                      });
                      setIsClassModalOpen(true);
                    }}
                    isMatch={isMatch}
                  />
                ))
              )}
            </div>
          </div>

          {/* Right Column: Classification Specifications & Attributes Canvas */}
          <div className="flex flex-1 flex-col overflow-y-auto min-w-0 bg-slate-50/50 p-5">
            {detailLoading ? (
              <div className="flex h-64 items-center justify-center text-xs text-gray-400">
                <RefreshCw className="h-5 w-5 animate-spin mr-2" />
                Loading specification attributes...
              </div>
            ) : selectedClassification ? (
              <div className="max-w-5xl space-y-5">
                {/* Classification Banner Card */}
                <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-2xs">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-bold text-gray-900">
                          {selectedClassification.classstructure_id}
                        </span>
                        <span className="rounded bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 text-[10px] font-semibold">
                          {selectedClassification.status}
                        </span>
                      </div>

                      <h3 className="text-base font-bold text-gray-900">
                        {selectedClassification.description}
                      </h3>

                      {/* Hierarchy Breadcrumb Path */}
                      <div className="flex items-center gap-1 text-xs text-gray-500 font-mono pt-1">
                        <Tag className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                        <span className="text-gray-700 font-semibold">
                          {selectedClassification.hierarchy_path}
                        </span>
                      </div>
                    </div>

                    {/* Top Actions */}
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setClassModalMode('create');
                          setEditingClass({
                            parent_classstructure_id: selectedClassification.classstructure_id,
                            use_with: selectedClassification.use_with || ['ASSET', 'LOCATIONS'],
                            status: 'ACTIVE',
                          });
                          setIsClassModalOpen(true);
                        }}
                        className="flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                        title="Add Child Classification"
                      >
                        <Plus className="h-3.5 w-3.5 text-sky-600" />
                        <span>Sub-Classification</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setClassModalMode('edit');
                          setEditingClass(selectedClassification);
                          setIsClassModalOpen(true);
                        }}
                        className="flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        <Edit2 className="h-3.5 w-3.5 text-gray-400" />
                        <span>Edit</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteClassification(selectedClassification.classstructure_id)}
                        className="flex h-8 w-8 items-center justify-center rounded-md border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 transition-colors"
                        title="Delete Classification"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Scope & Target Badges */}
                  <div className="mt-4 pt-3 border-t border-gray-100 flex flex-wrap items-center gap-3 text-xs text-gray-600">
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-400 font-medium">Use With:</span>
                      <div className="flex items-center gap-1">
                        {selectedClassification.use_with?.map((u) => (
                          <span
                            key={u}
                            className="rounded bg-slate-100 border border-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700"
                          >
                            {u}
                          </span>
                        ))}
                      </div>
                    </div>

                    <span className="text-gray-300">·</span>

                    <div>
                      <span className="text-gray-400 font-medium">Total Attributes: </span>
                      <span className="font-semibold text-gray-800">
                        {selectedClassification.all_attributes?.length || selectedClassification.attributes?.length || 0}
                      </span>
                    </div>

                    <span className="text-gray-300">·</span>

                    <div>
                      <span className="text-gray-400 font-medium">Classified Instances: </span>
                      <span className="font-semibold text-gray-800">
                        {classifiedAssets.length} Assets, {classifiedLocations.length} Locations
                      </span>
                    </div>
                  </div>
                </div>

                {/* Specification Attributes Section */}
                <div className="rounded-xl border border-gray-200 bg-white shadow-2xs overflow-hidden">
                  <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <Sliders className="h-4 w-4 text-sky-700" />
                      <h4 className="text-xs font-bold uppercase tracking-wider text-gray-800">
                        Specification Attributes Template
                      </h4>
                      <InfoTooltip text="Specification attributes attached to this classification or inherited from ancestors. Reused master attributes guarantee enterprise-wide consistency." />
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setAttrModalMode('create');
                        setEditingAttr({
                          classstructure_id: selectedClassification.classstructure_id,
                          data_type: 'ALN',
                          mandatory: false,
                          apply_down_hierarchy: true,
                          section: 'General',
                          display_sequence: (selectedClassification.attributes?.length || 0) + 1,
                        });
                        setIsAttrModalOpen(true);
                      }}
                      className="flex items-center gap-1 rounded-md bg-sky-50 border border-sky-200/80 px-2.5 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-100 transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Attach Attribute</span>
                    </button>
                  </div>

                  {/* Attributes Table Grouped by Section */}
                  {(!selectedClassification.all_attributes || selectedClassification.all_attributes.length === 0) ? (
                    <div className="p-8 text-center text-xs text-gray-400">
                      No specification attributes attached yet. Click "+ Attach Attribute" to reuse attributes from the catalog or define new specifications.
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {Object.entries(groupedAttributes).map(([sectionName, attrs]) => (
                        <div key={sectionName} className="p-4 space-y-2">
                          <div className="flex items-center gap-2 text-xs font-bold text-slate-700 bg-slate-50/80 px-3 py-1.5 rounded-md border border-slate-200/60">
                            <Layers className="h-3.5 w-3.5 text-slate-500" />
                            <span>{sectionName}</span>
                            <span className="text-[10px] font-normal text-gray-400">
                              ({attrs.length} {attrs.length === 1 ? 'attribute' : 'attributes'})
                            </span>
                          </div>

                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs border-collapse">
                              <thead>
                                <tr className="border-b border-gray-100 bg-slate-50/50 text-[11px] font-semibold text-gray-500">
                                  <th className="px-3 py-2">Attribute ID</th>
                                  <th className="px-3 py-2">Description / Label</th>
                                  <th className="px-3 py-2">Data Type</th>
                                  <th className="px-3 py-2">Unit (UOM)</th>
                                  <th className="px-3 py-2">Domain / Allowed Values</th>
                                  <th className="px-3 py-2">Inheritance & Cascade</th>
                                  <th className="px-3 py-2 text-right">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {attrs.map((attr) => {
                                  const typeBadge = getDataTypeBadge(attr.data_type);
                                  const isInherited = Boolean(attr.inherited_from);
                                  return (
                                    <tr key={attr.attribute_id} className="hover:bg-slate-50/50 transition-colors">
                                      <td className="px-3 py-2">
                                        <div className="flex items-center gap-1.5">
                                          <span className="font-mono font-bold text-gray-900">
                                            {attr.attribute_id}
                                          </span>
                                          {attr.mandatory && (
                                            <span className="rounded bg-amber-50 text-amber-800 border border-amber-200 px-1 text-[9px] font-semibold">
                                              Required
                                            </span>
                                          )}
                                        </div>
                                      </td>
                                      <td className="px-3 py-2 text-gray-700">
                                        {attr.description || '—'}
                                      </td>
                                      <td className="px-3 py-2">
                                        <span
                                          className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold border ${typeBadge.bg}`}
                                        >
                                          {typeBadge.label}
                                        </span>
                                      </td>
                                      <td className="px-3 py-2 font-mono text-gray-700 font-medium">
                                        {attr.unit_of_measure || '—'}
                                      </td>
                                      <td className="px-3 py-2">
                                        {attr.domain_values && attr.domain_values.length > 0 ? (
                                          <div className="flex flex-wrap gap-1 max-w-xs">
                                            {attr.domain_values.map((v) => (
                                              <span
                                                key={v}
                                                className="rounded bg-gray-100 text-gray-600 px-1.5 py-0.2 text-[10px]"
                                              >
                                                {v}
                                              </span>
                                            ))}
                                          </div>
                                        ) : (
                                          <span className="text-gray-400">Open Value</span>
                                        )}
                                      </td>
                                      <td className="px-3 py-2">
                                        <div className="flex items-center gap-1.5">
                                          {isInherited ? (
                                            <span
                                              className="rounded bg-indigo-50 text-indigo-700 border border-indigo-200/70 px-1.5 py-0.5 text-[10px] font-medium"
                                              title={`Inherited from ${attr.inherited_from_path || attr.inherited_from}`}
                                            >
                                              Inherited from {attr.inherited_from}
                                            </span>
                                          ) : (
                                            <span className="rounded bg-slate-100 text-slate-600 px-1.5 py-0.5 text-[10px] font-medium">
                                              Local
                                            </span>
                                          )}
                                          {attr.apply_down_hierarchy !== false && (
                                            <span className="text-[10px] text-gray-400 font-medium" title="Propagates down child taxonomy">
                                              (Cascades ↓)
                                            </span>
                                          )}
                                        </div>
                                      </td>
                                      <td className="px-3 py-2 text-right">
                                        {!isInherited && (
                                          <div className="flex items-center justify-end gap-1">
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setAttrModalMode('edit');
                                                setEditingAttr(attr);
                                                setIsAttrModalOpen(true);
                                              }}
                                              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                                              title="Edit Attribute"
                                            >
                                              <Edit2 className="h-3.5 w-3.5" />
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() =>
                                                handleDeleteAttribute(
                                                  selectedClassification.classstructure_id,
                                                  attr.attribute_id
                                                )
                                              }
                                              className="rounded p-1 text-gray-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                                              title="Delete Attribute"
                                            >
                                              <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                          </div>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Classified Instances Drilldown Section */}
                <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-2xs space-y-4">
                  <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-sky-700" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-800">
                      Classified Assets & Locations
                    </h4>
                    <InfoTooltip text="Live equipment and facility records classified under this taxonomy node." />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Assets Box */}
                    <div className="rounded-lg border border-gray-200/80 bg-slate-50/40 p-3.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
                          <Cpu className="h-3.5 w-3.5 text-slate-600" />
                          Assets ({classifiedAssets.length})
                        </span>
                      </div>

                      {classifiedAssets.length === 0 ? (
                        <p className="text-xs text-gray-400 py-2">No assets currently use this classification.</p>
                      ) : (
                        <div className="space-y-1.5 max-h-48 overflow-y-auto">
                          {classifiedAssets.map((ast) => (
                            <div
                              key={ast.asset_id}
                              onClick={() => onNavigateToAsset && onNavigateToAsset(ast.site_id, ast.asset_id)}
                              className="flex items-center justify-between rounded-md bg-white border border-gray-200/70 p-2 text-xs hover:border-sky-300 hover:bg-sky-50/40 cursor-pointer transition-colors"
                            >
                              <div className="min-w-0">
                                <span className="font-mono font-bold text-gray-800 mr-2">
                                  {ast.asset_id}
                                </span>
                                <span className="text-gray-500 truncate">{ast.name}</span>
                              </div>
                              <span className="rounded bg-slate-100 text-slate-600 px-1.5 py-0.5 text-[9px] font-mono shrink-0 ml-2">
                                {ast.site_id}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Locations Box */}
                    <div className="rounded-lg border border-gray-200/80 bg-slate-50/40 p-3.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5 text-sky-600" />
                          Locations ({classifiedLocations.length})
                        </span>
                      </div>

                      {classifiedLocations.length === 0 ? (
                        <p className="text-xs text-gray-400 py-2">No locations currently use this classification.</p>
                      ) : (
                        <div className="space-y-1.5 max-h-48 overflow-y-auto">
                          {classifiedLocations.map((loc) => (
                            <div
                              key={loc.location_id}
                              onClick={() => onNavigateToLocation && onNavigateToLocation(loc.site_id, loc.location_id)}
                              className="flex items-center justify-between rounded-md bg-white border border-gray-200/70 p-2 text-xs hover:border-sky-300 hover:bg-sky-50/40 cursor-pointer transition-colors"
                            >
                              <div className="min-w-0">
                                <span className="font-mono font-bold text-gray-800 mr-2">
                                  {loc.location_id}
                                </span>
                                <span className="text-gray-500 truncate">{loc.description}</span>
                              </div>
                              <span className="rounded bg-slate-100 text-slate-600 px-1.5 py-0.5 text-[9px] font-mono shrink-0 ml-2">
                                {loc.site_id}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center text-center p-8 text-gray-400">
                <FolderTree className="h-12 w-12 text-gray-300 mb-2" />
                <p className="text-sm font-semibold text-gray-700">No Classification Selected</p>
                <p className="text-xs text-gray-400 mt-1 max-w-sm">
                  Select a classification node from the tree on the left to inspect specification templates, inherited attributes, and associated assets.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: Master Attribute Catalog (ASSETATTRIBUTE Dictionary) */}
      {activeTab === 'catalog' && (
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <div className="max-w-6xl mx-auto space-y-4">
            {/* Search & Filter Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl border border-gray-200 shadow-2xs">
              <div className="flex items-center gap-3 flex-1 min-w-[280px]">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search master attribute dictionary by ID, description, UOM..."
                    value={catalogSearch}
                    onChange={(e) => setCatalogSearch(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 bg-slate-50/50 pl-9 pr-3 py-1.5 text-xs text-gray-800 placeholder-gray-400 focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                  {catalogSearch && (
                    <button
                      type="button"
                      onClick={() => setCatalogSearch('')}
                      className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Data Type Filter */}
                <div className="flex items-center gap-1 text-xs">
                  {['ALL', 'NUMERIC', 'ALN', 'TABLE', 'DATE', 'YORN'].map((dt) => (
                    <button
                      key={dt}
                      type="button"
                      onClick={() => setCatalogTypeFilter(dt)}
                      className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
                        catalogTypeFilter === dt
                          ? 'bg-sky-100 text-sky-800 font-semibold'
                          : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
                      }`}
                    >
                      {dt}
                    </button>
                  ))}
                </div>
              </div>

              <div className="text-xs text-gray-500 font-medium">
                Showing <span className="font-bold text-gray-800">{filteredCatalog.length}</span> master attributes
              </div>
            </div>

            {/* Master Catalog Table */}
            <div className="rounded-xl border border-gray-200 bg-white shadow-2xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-gray-100 bg-slate-50/75 text-[11px] font-semibold text-gray-600">
                      <th className="px-4 py-3">Master Attribute ID</th>
                      <th className="px-4 py-3">Standard Description</th>
                      <th className="px-4 py-3">Data Type</th>
                      <th className="px-4 py-3">Unit (UOM)</th>
                      <th className="px-4 py-3">Domain / Predefined Values</th>
                      <th className="px-4 py-3">Reused In</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {catalogLoading ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                          <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-sky-600" />
                          Loading master attribute repository...
                        </td>
                      </tr>
                    ) : filteredCatalog.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                          No master attributes match your search filter.
                        </td>
                      </tr>
                    ) : (
                      filteredCatalog.map((attr) => {
                        const typeBadge = getDataTypeBadge(attr.data_type);
                        const usageCount = attr.usage_count || 0;
                        return (
                          <tr key={attr.attribute_id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-4 py-3">
                              <span className="font-mono font-bold text-gray-900">
                                {attr.attribute_id}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-gray-800 font-medium">
                              {attr.description}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`inline-block rounded px-2 py-0.5 text-[10px] font-semibold border ${typeBadge.bg}`}
                              >
                                {typeBadge.label}
                              </span>
                            </td>
                            <td className="px-4 py-3 font-mono text-gray-700 font-medium">
                              {attr.unit_of_measure || '—'}
                            </td>
                            <td className="px-4 py-3">
                              {attr.domain_values && attr.domain_values.length > 0 ? (
                                <div className="flex flex-wrap gap-1 max-w-xs">
                                  {attr.domain_values.map((v) => (
                                    <span
                                      key={v}
                                      className="rounded bg-gray-100 text-gray-600 px-1.5 py-0.2 text-[10px]"
                                    >
                                      {v}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-gray-400">Open Value</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {usageCount > 0 ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="rounded bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 text-[10px] font-bold">
                                    {usageCount} {usageCount === 1 ? 'Taxonomy' : 'Taxonomies'}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-gray-400 text-[11px]">Unassigned</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <span className="rounded bg-slate-100 text-slate-700 border border-slate-200 px-1.5 py-0.5 text-[10px] font-semibold">
                                {attr.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSearchAttrId(attr.attribute_id);
                                    setActiveTab('search');
                                  }}
                                  className="rounded p-1 text-sky-600 hover:bg-sky-50 transition-colors"
                                  title="Query Across Fleet"
                                >
                                  <Search className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setMasterAttrModalMode('edit');
                                    setEditingMasterAttr(attr);
                                    setIsMasterAttrModalOpen(true);
                                  }}
                                  className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                                  title="Edit Master Attribute"
                                >
                                  <Edit2 className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  disabled={usageCount > 0}
                                  onClick={() => handleDeleteMasterAttribute(attr.attribute_id)}
                                  className={`rounded p-1 transition-colors ${
                                    usageCount > 0
                                      ? 'text-gray-300 cursor-not-allowed'
                                      : 'text-gray-400 hover:bg-rose-50 hover:text-rose-600'
                                  }`}
                                  title={usageCount > 0 ? 'Cannot delete attribute currently in use' : 'Delete Master Attribute'}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Cross-Fleet Attribute Search */}
      {activeTab === 'search' && (
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <div className="max-w-6xl mx-auto space-y-4">
            {/* Query Builder Box */}
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-2xs space-y-4">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <div className="flex items-center gap-2">
                  <Search className="h-4 w-4 text-sky-700" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900">
                    Cross-Fleet Attribute Query
                  </h3>
                  <InfoTooltip text="Search all assets and locations across different classifications sharing a common master attribute (e.g. all motors with HP >= 50, all pumps with Flow Rate >= 400 GPM)." />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
                {/* Select Attribute */}
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">
                    Master Attribute *
                  </label>
                  <select
                    value={searchAttrId}
                    onChange={(e) => setSearchAttrId(e.target.value)}
                    className="w-full rounded-md border border-gray-200 px-3 py-1.5 font-mono text-xs font-bold focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  >
                    {masterAttributes.map((a) => (
                      <option key={a.attribute_id} value={a.attribute_id}>
                        {a.attribute_id} — {a.description} ({a.unit_of_measure || a.data_type})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Filter Numeric Range or Alphanumeric Match */}
                {searchResult?.attribute?.data_type === 'NUMERIC' ? (
                  <>
                    <div>
                      <label className="block font-semibold text-gray-700 mb-1">
                        Min Value ({searchResult.attribute.unit_of_measure || 'Numeric'})
                      </label>
                      <input
                        type="number"
                        placeholder="e.g. 50"
                        value={searchMinNum}
                        onChange={(e) => setSearchMinNum(e.target.value)}
                        className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-gray-700 mb-1">
                        Max Value ({searchResult.attribute.unit_of_measure || 'Numeric'})
                      </label>
                      <input
                        type="number"
                        placeholder="e.g. 500"
                        value={searchMaxNum}
                        onChange={(e) => setSearchMaxNum(e.target.value)}
                        className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="block font-semibold text-gray-700 mb-1">
                        Alphanumeric Match (Contains)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Stainless, TEFC"
                        value={searchAlnMatch}
                        onChange={(e) => setSearchAlnMatch(e.target.value)}
                        className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-gray-700 mb-1">
                        Exact Domain Value
                      </label>
                      {searchResult?.attribute?.domain_values && searchResult.attribute.domain_values.length > 0 ? (
                        <select
                          value={searchExactAln}
                          onChange={(e) => setSearchExactAln(e.target.value)}
                          className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                        >
                          <option value="">(Any Domain Value)</option>
                          {searchResult.attribute.domain_values.map((v) => (
                            <option key={v} value={v}>
                              {v}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          placeholder="Exact match string"
                          value={searchExactAln}
                          onChange={(e) => setSearchExactAln(e.target.value)}
                          className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                        />
                      )}
                    </div>
                  </>
                )}

                {/* Scope & Execution Button */}
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <label className="block font-semibold text-gray-700 mb-1">
                      Entity Scope
                    </label>
                    <select
                      value={searchEntityType}
                      onChange={(e) => setSearchEntityType(e.target.value as any)}
                      className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    >
                      <option value="ALL">All (Assets & Locations)</option>
                      <option value="ASSET">Assets Only</option>
                      <option value="LOCATION">Locations Only</option>
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={handleExecuteSearch}
                    disabled={searchLoading}
                    className="flex items-center gap-1.5 rounded-md bg-sky-600 px-4 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-sky-700 disabled:opacity-50 transition-colors"
                  >
                    {searchLoading ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Search className="h-3.5 w-3.5" />
                    )}
                    <span>Filter</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Query Results Table */}
            <div className="rounded-xl border border-gray-200 bg-white shadow-2xs overflow-hidden">
              <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5 bg-slate-50/75">
                <div className="flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-slate-700" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-800">
                    Fleet Discovery Results
                  </h4>
                </div>
                <span className="text-xs font-semibold text-gray-600">
                  Total Matches: {searchResult?.total_count || 0}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-gray-100 bg-slate-50/50 text-[11px] font-semibold text-gray-600">
                      <th className="px-4 py-2.5">Type</th>
                      <th className="px-4 py-2.5">Site</th>
                      <th className="px-4 py-2.5">Identifier</th>
                      <th className="px-4 py-2.5">Description</th>
                      <th className="px-4 py-2.5">Classification Path</th>
                      <th className="px-4 py-2.5">Attribute Value</th>
                      <th className="px-4 py-2.5">Status</th>
                      <th className="px-4 py-2.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {searchLoading ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                          <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-sky-600" />
                          Querying equipment across classification taxonomy...
                        </td>
                      </tr>
                    ) : (!searchResult || searchResult.total_count === 0) ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                          No assets or locations matched the specified criteria for attribute "{searchAttrId}".
                        </td>
                      </tr>
                    ) : (
                      <>
                        {searchResult.assets.map((ast) => (
                          <tr key={`asset-${ast.site_id}-${ast.asset_id}`} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-4 py-2.5">
                              <span className="rounded bg-slate-100 text-slate-700 border border-slate-200 px-1.5 py-0.5 text-[10px] font-semibold">
                                ASSET
                              </span>
                            </td>
                            <td className="px-4 py-2.5 font-mono text-gray-600 font-semibold">
                              {ast.site_id}
                            </td>
                            <td className="px-4 py-2.5 font-mono font-bold text-gray-900">
                              {ast.asset_id}
                            </td>
                            <td className="px-4 py-2.5 text-gray-700">
                              {ast.description || '—'}
                            </td>
                            <td className="px-4 py-2.5 font-mono text-[11px] text-gray-600">
                              {ast.classification_path || ast.classstructure_id || '—'}
                            </td>
                            <td className="px-4 py-2.5">
                              <span className="font-mono font-bold text-sky-900 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded">
                                {ast.num_value !== null && ast.num_value !== undefined
                                  ? `${ast.num_value} ${ast.unit_of_measure || ''}`
                                  : ast.aln_value || '—'}
                              </span>
                            </td>
                            <td className="px-4 py-2.5">
                              <span className="rounded bg-slate-100 text-slate-700 px-1.5 py-0.5 text-[10px] font-semibold">
                                {ast.status}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              {onNavigateToAsset && (
                                <button
                                  type="button"
                                  onClick={() => onNavigateToAsset(ast.site_id, ast.asset_id)}
                                  className="inline-flex items-center gap-1 text-sky-600 hover:text-sky-800 font-medium"
                                >
                                  <span>View</span>
                                  <ArrowRight className="h-3 w-3" />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}

                        {searchResult.locations.map((loc) => (
                          <tr key={`loc-${loc.site_id}-${loc.location_id}`} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-4 py-2.5">
                              <span className="rounded bg-indigo-50 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 text-[10px] font-semibold">
                                LOCATION
                              </span>
                            </td>
                            <td className="px-4 py-2.5 font-mono text-gray-600 font-semibold">
                              {loc.site_id}
                            </td>
                            <td className="px-4 py-2.5 font-mono font-bold text-gray-900">
                              {loc.location_id}
                            </td>
                            <td className="px-4 py-2.5 text-gray-700">
                              {loc.description || '—'}
                            </td>
                            <td className="px-4 py-2.5 font-mono text-[11px] text-gray-600">
                              {loc.classification_path || loc.classstructure_id || '—'}
                            </td>
                            <td className="px-4 py-2.5">
                              <span className="font-mono font-bold text-indigo-900 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded">
                                {loc.num_value !== null && loc.num_value !== undefined
                                  ? `${loc.num_value} ${loc.unit_of_measure || ''}`
                                  : loc.aln_value || '—'}
                              </span>
                            </td>
                            <td className="px-4 py-2.5">
                              <span className="rounded bg-slate-100 text-slate-700 px-1.5 py-0.5 text-[10px] font-semibold">
                                {loc.status}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              {onNavigateToLocation && (
                                <button
                                  type="button"
                                  onClick={() => onNavigateToLocation(loc.site_id, loc.location_id)}
                                  className="inline-flex items-center gap-1 text-sky-600 hover:text-sky-800 font-medium"
                                >
                                  <span>View</span>
                                  <ArrowRight className="h-3 w-3" />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Classification Add / Edit */}
      {isClassModalOpen && (
        <ClassificationEditorModal
          mode={classModalMode}
          initialData={editingClass || {}}
          flatClassifications={flatList}
          onClose={() => {
            setIsClassModalOpen(false);
            setEditingClass(null);
          }}
          onSaved={async (saved) => {
            setIsClassModalOpen(false);
            setEditingClass(null);
            await fetchData();
            setSelectedId(saved.classstructure_id);
          }}
        />
      )}

      {/* Modal: Attribute Template Add / Edit with Catalog Reuse */}
      {isAttrModalOpen && selectedClassification && (
        <AttributeEditorModal
          mode={attrModalMode}
          classstructureId={selectedClassification.classstructure_id}
          masterAttributes={masterAttributes}
          initialData={editingAttr || {}}
          onClose={() => {
            setIsAttrModalOpen(false);
            setEditingAttr(null);
          }}
          onSaved={async () => {
            setIsAttrModalOpen(false);
            setEditingAttr(null);
            await fetchSelectedDetail(selectedClassification.classstructure_id);
            await fetchCatalog();
          }}
        />
      )}

      {/* Modal: Master Attribute Register / Edit */}
      {isMasterAttrModalOpen && (
        <MasterAttributeEditorModal
          mode={masterAttrModalMode}
          initialData={editingMasterAttr || {}}
          onClose={() => {
            setIsMasterAttrModalOpen(false);
            setEditingMasterAttr(null);
          }}
          onSaved={async () => {
            setIsMasterAttrModalOpen(false);
            setEditingMasterAttr(null);
            await fetchCatalog();
          }}
        />
      )}
    </div>
  );
};

// ============================================================================
// Tree Node Item Component
// ============================================================================

interface ClassificationTreeNodeItemProps {
  node: ClassificationTreeNode;
  level: number;
  expandedKeys: Set<string>;
  onToggleExpand: (key: string, e?: React.MouseEvent) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAddChild: (parent: ClassificationTreeNode) => void;
  isMatch: (text?: string | null) => boolean;
}

const ClassificationTreeNodeItem: React.FC<ClassificationTreeNodeItemProps> = ({
  node,
  level,
  expandedKeys,
  onToggleExpand,
  selectedId,
  onSelect,
  onAddChild,
  isMatch,
}) => {
  const isExpanded = expandedKeys.has(node.classstructure_id);
  const isSelected = selectedId === node.classstructure_id;
  const hasChildren = Boolean(node.children && node.children.length > 0);

  const matched =
    isMatch(node.classification_id) ||
    isMatch(node.description) ||
    isMatch(node.hierarchy_path);

  return (
    <div>
      <div
        onClick={() => onSelect(node.classstructure_id)}
        style={{ paddingLeft: `${Math.max(4, level * 14 + 6)}px` }}
        className={`group flex items-center justify-between rounded-md py-1.5 pr-2 text-xs transition-colors cursor-pointer select-none ${
          isSelected
            ? 'bg-sky-100/80 font-semibold text-sky-950'
            : matched
            ? 'text-gray-700 hover:bg-slate-100/70'
            : 'text-gray-400 hover:bg-slate-100/50'
        }`}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {hasChildren ? (
            <button
              type="button"
              onClick={(e) => onToggleExpand(node.classstructure_id, e)}
              className="p-0.5 text-gray-400 hover:text-gray-700 rounded transition-colors"
            >
              {isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </button>
          ) : (
            <div className="w-4" />
          )}

          <Tag className={`h-3.5 w-3.5 shrink-0 ${isSelected ? 'text-sky-700' : 'text-gray-400'}`} />

          <span className="font-mono text-xs font-semibold truncate">
            {node.classification_id}
          </span>

          <span className="text-[11px] text-gray-500 truncate hidden sm:inline">
            — {node.description}
          </span>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAddChild(node);
          }}
          className="opacity-0 group-hover:opacity-100 rounded p-1 text-gray-400 hover:bg-gray-200/60 hover:text-gray-800 transition-opacity"
          title="Add Child Classification"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>

      {hasChildren && isExpanded && (
        <div className="space-y-0.5">
          {node.children!.map((child) => (
            <ClassificationTreeNodeItem
              key={child.classstructure_id}
              node={child}
              level={level + 1}
              expandedKeys={expandedKeys}
              onToggleExpand={onToggleExpand}
              selectedId={selectedId}
              onSelect={onSelect}
              onAddChild={onAddChild}
              isMatch={isMatch}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Modal: Classification Editor (Create / Edit)
// ============================================================================

interface ClassificationEditorModalProps {
  mode: 'create' | 'edit';
  initialData: Partial<Classification>;
  flatClassifications: Classification[];
  onClose: () => void;
  onSaved: (saved: Classification) => void;
}

const ClassificationEditorModal: React.FC<ClassificationEditorModalProps> = ({
  mode,
  initialData,
  flatClassifications,
  onClose,
  onSaved,
}) => {
  const [formData, setFormData] = useState({
    classstructure_id: initialData.classstructure_id || '',
    classification_id: initialData.classification_id || '',
    parent_classstructure_id: initialData.parent_classstructure_id || '',
    description: initialData.description || '',
    use_with_asset: initialData.use_with?.includes('ASSET') ?? true,
    use_with_locations: initialData.use_with?.includes('LOCATIONS') ?? true,
    status: initialData.status || 'ACTIVE',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.classification_id.trim()) {
      setError('Classification Noun/ID is required.');
      return;
    }
    if (!formData.description.trim()) {
      setError('Description is required.');
      return;
    }

    const useWith: string[] = [];
    if (formData.use_with_asset) useWith.push('ASSET');
    if (formData.use_with_locations) useWith.push('LOCATIONS');

    if (useWith.length === 0) {
      setError('Select at least one Use With application target (Asset or Locations).');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (mode === 'create') {
        const created = await api.createClassification({
          classstructure_id: formData.classstructure_id.trim() || undefined,
          classification_id: formData.classification_id.trim(),
          parent_classstructure_id: formData.parent_classstructure_id || undefined,
          description: formData.description.trim(),
          use_with: useWith,
          status: formData.status as 'ACTIVE' | 'INACTIVE',
        });
        onSaved(created);
      } else {
        const updated = await api.updateClassification(initialData.classstructure_id!, {
          classification_id: formData.classification_id.trim(),
          parent_classstructure_id: formData.parent_classstructure_id || undefined,
          description: formData.description.trim(),
          use_with: useWith,
          status: formData.status as 'ACTIVE' | 'INACTIVE',
        });
        onSaved(updated);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save classification.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-2xs p-4">
      <div className="w-full max-w-lg rounded-xl border border-gray-200 bg-white shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-gray-100 bg-slate-50/75 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Tag className="h-4 w-4 text-sky-700" />
            <h3 className="text-sm font-bold text-gray-900">
              {mode === 'create' ? 'New Enterprise Classification' : 'Edit Classification'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-rose-50 border border-rose-200 p-2.5 text-rose-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Classification ID / Noun *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. CENTRIFUGAL, MOTOR"
                value={formData.classification_id}
                onChange={(e) =>
                  setFormData({ ...formData, classification_id: e.target.value.toUpperCase() })
                }
                className="w-full rounded-md border border-gray-200 px-3 py-1.5 font-mono text-xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Parent Classification
              </label>
              <select
                value={formData.parent_classstructure_id}
                onChange={(e) =>
                  setFormData({ ...formData, parent_classstructure_id: e.target.value })
                }
                className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                <option value="">(None - Top Level Root)</option>
                {flatClassifications
                  .filter((c) => c.classstructure_id !== initialData.classstructure_id)
                  .map((c) => (
                    <option key={c.classstructure_id} value={c.classstructure_id}>
                      {c.hierarchy_path} ({c.description})
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-gray-700 mb-1">
              Description *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Centrifugal Multi-Stage High Pressure Pumps"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>

          <div>
            <label className="block font-semibold text-gray-700 mb-1.5">
              Use With Applications *
            </label>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1.5 text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.use_with_asset}
                  onChange={(e) =>
                    setFormData({ ...formData, use_with_asset: e.target.checked })
                  }
                  className="rounded text-sky-600 focus:ring-sky-500"
                />
                <span>Assets</span>
              </label>

              <label className="flex items-center gap-1.5 text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.use_with_locations}
                  onChange={(e) =>
                    setFormData({ ...formData, use_with_locations: e.target.checked })
                  }
                  className="rounded text-sky-600 focus:ring-sky-500"
                />
                <span>Locations</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-gray-700 mb-1">Status</label>
            <select
              value={formData.status}
              onChange={(e) =>
                setFormData({ ...formData, status: e.target.value as 'ACTIVE' | 'INACTIVE' })
              }
              className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            >
              <option value="ACTIVE">ACTIVE</option>
              <option value="INACTIVE">INACTIVE</option>
            </select>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-1.5 rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-50 transition-colors"
            >
              {saving && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
              <span>{mode === 'create' ? 'Create Classification' : 'Save Changes'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ============================================================================
// Modal: Specification Attribute Template Editor (Attach / Reuse / Edit)
// ============================================================================

interface AttributeEditorModalProps {
  mode: 'create' | 'edit';
  classstructureId: string;
  masterAttributes: AssetAttribute[];
  initialData: Partial<ClassSpec>;
  onClose: () => void;
  onSaved: () => void;
}

const AttributeEditorModal: React.FC<AttributeEditorModalProps> = ({
  mode,
  classstructureId,
  masterAttributes,
  initialData,
  onClose,
  onSaved,
}) => {
  // Source mode: 'reuse' (select existing master attribute) or 'new' (define new attribute)
  const [sourceMode, setSourceMode] = useState<'reuse' | 'new'>('reuse');

  const [formData, setFormData] = useState({
    attribute_id: initialData.attribute_id || '',
    section: initialData.section || 'General',
    description: initialData.description || '',
    data_type: (initialData.data_type || 'ALN') as SpecDataType,
    unit_of_measure: initialData.unit_of_measure || '',
    domain_values_raw: (initialData.domain_values || []).join(', '),
    default_value: initialData.default_value || '',
    mandatory: Boolean(initialData.mandatory),
    apply_down_hierarchy: initialData.apply_down_hierarchy !== false,
    display_sequence: initialData.display_sequence || 1,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // When selecting an existing master attribute in reuse mode
  const handleSelectMaster = (attrId: string) => {
    const master = masterAttributes.find((m) => m.attribute_id === attrId);
    if (master) {
      setFormData((prev) => ({
        ...prev,
        attribute_id: master.attribute_id,
        description: master.description,
        data_type: master.data_type,
        unit_of_measure: master.unit_of_measure || '',
        domain_values_raw: (master.domain_values || []).join(', '),
      }));
    } else {
      setFormData((prev) => ({ ...prev, attribute_id: attrId }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.attribute_id.trim()) {
      setError('Attribute ID is required.');
      return;
    }

    const domainValues = formData.domain_values_raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    setSaving(true);
    setError(null);

    try {
      if (mode === 'create') {
        await api.addClassificationAttribute(classstructureId, {
          attribute_id: formData.attribute_id.trim().toUpperCase(),
          section: formData.section.trim() || undefined,
          description: formData.description.trim() || undefined,
          data_type: formData.data_type,
          unit_of_measure: formData.unit_of_measure.trim() || undefined,
          domain_values: domainValues.length > 0 ? domainValues : undefined,
          default_value: formData.default_value.trim() || undefined,
          mandatory: formData.mandatory,
          apply_down_hierarchy: formData.apply_down_hierarchy,
          display_sequence: Number(formData.display_sequence) || 1,
        });
      } else {
        await api.updateClassificationAttribute(
          classstructureId,
          initialData.attribute_id!,
          {
            section: formData.section.trim() || undefined,
            description: formData.description.trim() || undefined,
            data_type: formData.data_type,
            unit_of_measure: formData.unit_of_measure.trim() || undefined,
            domain_values: domainValues.length > 0 ? domainValues : undefined,
            default_value: formData.default_value.trim() || undefined,
            mandatory: formData.mandatory,
            apply_down_hierarchy: formData.apply_down_hierarchy,
            display_sequence: Number(formData.display_sequence) || 1,
          }
        );
      }
      onSaved();
    } catch (err: any) {
      setError(err.message || 'Failed to save attribute template.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-2xs p-4">
      <div className="w-full max-w-lg rounded-xl border border-gray-200 bg-white shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-gray-100 bg-slate-50/75 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Sliders className="h-4 w-4 text-sky-700" />
            <h3 className="text-sm font-bold text-gray-900">
              {mode === 'create' ? 'Attach Specification Attribute' : 'Edit Specification Template'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Source Mode Toggle (When creating) */}
        {mode === 'create' && (
          <div className="flex items-center border-b border-gray-100 bg-slate-50/50 p-2.5 gap-2">
            <button
              type="button"
              onClick={() => setSourceMode('reuse')}
              className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-all ${
                sourceMode === 'reuse'
                  ? 'bg-white text-slate-900 border border-gray-200 shadow-2xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Select from Master Catalog
            </button>
            <button
              type="button"
              onClick={() => {
                setSourceMode('new');
                setFormData((prev) => ({
                  ...prev,
                  attribute_id: '',
                  description: '',
                  unit_of_measure: '',
                  domain_values_raw: '',
                }));
              }}
              className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-all ${
                sourceMode === 'new'
                  ? 'bg-white text-slate-900 border border-gray-200 shadow-2xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Create New Attribute
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-rose-50 border border-rose-200 p-2.5 text-rose-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Catalog Picker (Reuse Mode) */}
          {mode === 'create' && sourceMode === 'reuse' && (
            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Choose Reusable Master Attribute *
              </label>
              <select
                value={formData.attribute_id}
                onChange={(e) => handleSelectMaster(e.target.value)}
                className="w-full rounded-md border border-gray-200 px-3 py-1.5 font-mono text-xs font-bold text-gray-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                <option value="">(Select a Master Attribute)</option>
                {masterAttributes.map((m) => (
                  <option key={m.attribute_id} value={m.attribute_id}>
                    {m.attribute_id} — {m.description} ({m.unit_of_measure || m.data_type})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* New Attribute ID Input */}
          {(mode === 'edit' || sourceMode === 'new') && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-gray-700 mb-1">
                  Attribute ID *
                </label>
                <input
                  type="text"
                  required
                  disabled={mode === 'edit'}
                  placeholder="e.g. FLOW_RATE, HORSEPOWER"
                  value={formData.attribute_id}
                  onChange={(e) =>
                    setFormData({ ...formData, attribute_id: e.target.value.toUpperCase() })
                  }
                  className="w-full rounded-md border border-gray-200 px-3 py-1.5 font-mono text-xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:bg-gray-100"
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">
                  Data Type *
                </label>
                <select
                  value={formData.data_type}
                  onChange={(e) =>
                    setFormData({ ...formData, data_type: e.target.value as SpecDataType })
                  }
                  className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                >
                  <option value="NUMERIC">NUMERIC (Measurement / Rating)</option>
                  <option value="ALN">ALN (Alphanumeric String)</option>
                  <option value="DATE">DATE (Date / Timestamp)</option>
                  <option value="YORN">YORN (Yes / No Boolean)</option>
                  <option value="TABLE">TABLE (Lookup Table)</option>
                </select>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Section Grouping
              </label>
              <input
                type="text"
                list="standard-sections-list"
                placeholder="e.g. Mechanical, Electrical"
                value={formData.section}
                onChange={(e) => setFormData({ ...formData, section: e.target.value })}
                className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
              <datalist id="standard-sections-list">
                {STANDARD_SECTIONS.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Unit of Measure (UOM)
              </label>
              <input
                type="text"
                placeholder="e.g. HP, GPM, PSI, V, SQFT"
                value={formData.unit_of_measure}
                onChange={(e) => setFormData({ ...formData, unit_of_measure: e.target.value })}
                className="w-full rounded-md border border-gray-200 px-3 py-1.5 font-mono text-xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-gray-700 mb-1">
              Description / Display Label
            </label>
            <input
              type="text"
              placeholder="e.g. Rated Design Flow Rate"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>

          <div>
            <label className="block font-semibold text-gray-700 mb-1">
              Domain / Allowed Values (Comma-separated)
            </label>
            <input
              type="text"
              placeholder="e.g. 316L Stainless Steel, Cast Iron, Hastelloy"
              value={formData.domain_values_raw}
              onChange={(e) => setFormData({ ...formData, domain_values_raw: e.target.value })}
              className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>

          <div className="flex flex-col gap-2 pt-1 border-t border-gray-100">
            <label className="flex items-center gap-1.5 text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.mandatory}
                onChange={(e) => setFormData({ ...formData, mandatory: e.target.checked })}
                className="rounded text-sky-600 focus:ring-sky-500"
              />
              <span className="font-semibold">Mandatory field</span>
              <span className="text-gray-400 font-normal">(Value required when creating/editing asset specifications)</span>
            </label>

            <label className="flex items-center gap-1.5 text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.apply_down_hierarchy}
                onChange={(e) =>
                  setFormData({ ...formData, apply_down_hierarchy: e.target.checked })
                }
                className="rounded text-sky-600 focus:ring-sky-500"
              />
              <span className="font-semibold">Apply down hierarchy</span>
              <span className="text-gray-400 font-normal">(Cascades specification down to all child classifications)</span>
            </label>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-1.5 rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-50 transition-colors"
            >
              {saving && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
              <span>{mode === 'create' ? 'Attach to Classification' : 'Save Changes'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ============================================================================
// Modal: Master Attribute Catalog Editor (Create / Edit)
// ============================================================================

interface MasterAttributeEditorModalProps {
  mode: 'create' | 'edit';
  initialData: Partial<AssetAttribute>;
  onClose: () => void;
  onSaved: () => void;
}

const MasterAttributeEditorModal: React.FC<MasterAttributeEditorModalProps> = ({
  mode,
  initialData,
  onClose,
  onSaved,
}) => {
  const [formData, setFormData] = useState({
    attribute_id: initialData.attribute_id || '',
    description: initialData.description || '',
    data_type: (initialData.data_type || 'ALN') as SpecDataType,
    unit_of_measure: initialData.unit_of_measure || '',
    domain_values_raw: (initialData.domain_values || []).join(', '),
    status: initialData.status || 'ACTIVE',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.attribute_id.trim()) {
      setError('Attribute ID is required.');
      return;
    }
    if (!formData.description.trim()) {
      setError('Description is required.');
      return;
    }

    const domainValues = formData.domain_values_raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    setSaving(true);
    setError(null);

    try {
      if (mode === 'create') {
        await api.createMasterAttribute({
          attribute_id: formData.attribute_id.trim().toUpperCase(),
          description: formData.description.trim(),
          data_type: formData.data_type,
          unit_of_measure: formData.unit_of_measure.trim() || undefined,
          domain_values: domainValues.length > 0 ? domainValues : undefined,
          status: formData.status as 'ACTIVE' | 'INACTIVE',
        });
      } else {
        await api.updateMasterAttribute(initialData.attribute_id!, {
          description: formData.description.trim(),
          data_type: formData.data_type,
          unit_of_measure: formData.unit_of_measure.trim() || undefined,
          domain_values: domainValues.length > 0 ? domainValues : undefined,
          status: formData.status as 'ACTIVE' | 'INACTIVE',
        });
      }
      onSaved();
    } catch (err: any) {
      setError(err.message || 'Failed to save master attribute.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-2xs p-4">
      <div className="w-full max-w-lg rounded-xl border border-gray-200 bg-white shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-gray-100 bg-slate-50/75 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-sky-700" />
            <h3 className="text-sm font-bold text-gray-900">
              {mode === 'create' ? 'Register New Master Attribute' : 'Edit Master Attribute'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-rose-50 border border-rose-200 p-2.5 text-rose-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Attribute Identifier *
              </label>
              <input
                type="text"
                required
                disabled={mode === 'edit'}
                placeholder="e.g. HORSEPOWER, FLOW_RATE"
                value={formData.attribute_id}
                onChange={(e) =>
                  setFormData({ ...formData, attribute_id: e.target.value.toUpperCase() })
                }
                className="w-full rounded-md border border-gray-200 px-3 py-1.5 font-mono text-xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:bg-gray-100"
              />
            </div>

            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Data Type *
              </label>
              <select
                value={formData.data_type}
                onChange={(e) =>
                  setFormData({ ...formData, data_type: e.target.value as SpecDataType })
                }
                className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                <option value="NUMERIC">NUMERIC (Measurement / Decimal)</option>
                <option value="ALN">ALN (Alphanumeric String)</option>
                <option value="DATE">DATE (Date / Timestamp)</option>
                <option value="YORN">YORN (Yes / No Boolean)</option>
                <option value="TABLE">TABLE (Lookup Table)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-gray-700 mb-1">
              Standard Global Description *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Motor Rated Horsepower"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Unit of Measure (UOM)
              </label>
              <input
                type="text"
                placeholder="e.g. HP, V, GPM, PSI, SQFT"
                value={formData.unit_of_measure}
                onChange={(e) => setFormData({ ...formData, unit_of_measure: e.target.value })}
                className="w-full rounded-md border border-gray-200 px-3 py-1.5 font-mono text-xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Status
              </label>
              <select
                value={formData.status}
                onChange={(e) =>
                  setFormData({ ...formData, status: e.target.value as 'ACTIVE' | 'INACTIVE' })
                }
                className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                <option value="ACTIVE">ACTIVE</option>
                <option value="INACTIVE">INACTIVE</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-gray-700 mb-1">
              Predefined Domain Values (Optional comma-separated list)
            </label>
            <input
              type="text"
              placeholder="e.g. 316L Stainless Steel, Cast Iron, Hastelloy"
              value={formData.domain_values_raw}
              onChange={(e) => setFormData({ ...formData, domain_values_raw: e.target.value })}
              className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-1.5 rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-50 transition-colors"
            >
              {saving && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
              <span>{mode === 'create' ? 'Register Attribute' : 'Save Attribute'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
