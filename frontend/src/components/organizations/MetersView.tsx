import React, { useState, useEffect, useMemo } from 'react';
import {
  Gauge,
  Layers,
  Cpu,
  AlertTriangle,
  Plus,
  Minus,
  MoreVertical,
  Search,
  Filter,
  RefreshCw,
  Clock,
  Activity,
  History,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  X,
  FileText,
  Sliders,
  ChevronRight,
  ChevronDown,
  RotateCcw,
  Sparkles,
  Zap,
} from 'lucide-react';
import { apiClient } from '../../api/client';
import type {
  Meter,
  MeterGroup,
  MeterInGroup,
  AssetMeter,
  LocationMeter,
  MeterReading,
  MeasurePoint,
  MeterReadingResponse,
  Site,
  Asset,
  Location,
} from '../../types';
import { InfoTooltip } from '../people/InfoTooltip';

type SubTab = 'catalog' | 'groups' | 'equipment' | 'condition';

export const MetersView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<SubTab>('equipment');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Common metadata
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string>('BEDFORD');

  // Tab 1: Master Meters
  const [meters, setMeters] = useState<Meter[]>([]);
  const [meterSearch, setMeterSearch] = useState('');
  const [meterTypeFilter, setMeterTypeFilter] = useState<string>('ALL');
  const [isNewMeterOpen, setIsNewMeterOpen] = useState(false);
  const [editingMeter, setEditingMeter] = useState<Meter | null>(null);

  // Meter form state
  const [meterFormId, setMeterFormId] = useState('');
  const [meterFormDesc, setMeterFormDesc] = useState('');
  const [meterFormType, setMeterFormType] = useState<'CONTINUOUS' | 'GAUGE' | 'CHARACTERISTIC'>('CONTINUOUS');
  const [meterFormReadingType, setMeterFormReadingType] = useState<'ACTUAL' | 'DELTA'>('ACTUAL');
  const [meterFormUom, setMeterFormUom] = useState('');
  const [meterFormDomainVals, setMeterFormDomainVals] = useState('');

  // Tab 2: Meter Groups
  const [meterGroups, setMeterGroups] = useState<MeterGroup[]>([]);
  const [groupSearch, setGroupSearch] = useState('');
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [isNewGroupOpen, setIsNewGroupOpen] = useState(false);
  const [newGroupId, setNewGroupId] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [isAddMeterToGroupOpen, setIsAddMeterToGroupOpen] = useState(false);
  const [selectedGroupForMeter, setSelectedGroupForMeter] = useState<string | null>(null);
  const [addMeterToGroupId, setAddMeterToGroupId] = useState('');
  const [addMeterRollover, setAddMeterRollover] = useState<string>('');

  // Tab 3: Equipment Meters (Assets & Locations)
  const [equipmentType, setEquipmentType] = useState<'ASSET' | 'LOCATION'>('ASSET');
  const [assetsList, setAssetsList] = useState<Asset[]>([]);
  const [locationsList, setLocationsList] = useState<Location[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string>('PUMP_SYS_100');
  const [selectedLocationId, setSelectedLocationId] = useState<string>('MECH_ROOM_101');
  const [assetMeters, setAssetMeters] = useState<AssetMeter[]>([]);
  const [locationMeters, setLocationMeters] = useState<LocationMeter[]>([]);

  // Equipment Attach Drawer/Modal
  const [isAttachOpen, setIsAttachOpen] = useState(false);
  const [attachMode, setAttachMode] = useState<'single' | 'group'>('single');
  const [attachMeterId, setAttachMeterId] = useState('');
  const [attachGroupId, setAttachGroupId] = useState('');
  const [attachRollover, setAttachRollover] = useState<string>('');
  const [attachInitReading, setAttachInitReading] = useState<string>('0');
  const [attachInitAln, setAttachInitAln] = useState<string>('');

  // Equipment Reading Entry Modal
  const [activeReadingMeter, setActiveReadingMeter] = useState<AssetMeter | LocationMeter | null>(null);
  const [readingVal, setReadingVal] = useState<string>('');
  const [readingAln, setReadingAln] = useState<string>('');
  const [readingInspector, setReadingInspector] = useState<string>('TECH-01');
  const [readingWorkOrder, setReadingWorkOrder] = useState<string>('');
  const [readingRemarks, setReadingRemarks] = useState<string>('');
  const [readingManualRollover, setReadingManualRollover] = useState(false);
  const [readingBreachAlert, setReadingBreachAlert] = useState<any | null>(null);
  const [readingSuccessToast, setReadingSuccessToast] = useState<string | null>(null);

  // Equipment Meter Reset Modal
  const [activeResetMeter, setActiveResetMeter] = useState<AssetMeter | null>(null);
  const [resetType, setResetType] = useState<'OVERHAUL' | 'REPAIR' | 'REPLACE_METER'>('OVERHAUL');
  const [resetNewInit, setResetNewInit] = useState<string>('0');
  const [resetRollover, setResetRollover] = useState<string>('');
  const [resetRemarks, setResetRemarks] = useState<string>('');

  // Equipment Readings History Drawer
  const [historyMeter, setHistoryMeter] = useState<AssetMeter | null>(null);
  const [meterReadingsList, setMeterReadingsList] = useState<MeterReading[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);

  // Tab 4: Condition Monitoring (Measure Points)
  const [measurePoints, setMeasurePoints] = useState<MeasurePoint[]>([]);
  const [mpSearch, setMpSearch] = useState('');
  const [isNewMpOpen, setIsNewMpOpen] = useState(false);
  const [mpFormId, setMpFormId] = useState('');
  const [mpFormDesc, setMpFormDesc] = useState('');
  const [mpFormMeterId, setMpFormMeterId] = useState('');
  const [mpFormAssetId, setMpFormAssetId] = useState('');
  const [mpFormUpperAction, setMpFormUpperAction] = useState('');
  const [mpFormLowerAction, setMpFormLowerAction] = useState('');
  const [mpFormUpperWarn, setMpFormUpperWarn] = useState('');
  const [mpFormLowerWarn, setMpFormLowerWarn] = useState('');
  const [mpFormAlnVal, setMpFormAlnVal] = useState('');
  const [mpFormActionDesc, setMpFormActionDesc] = useState('');
  const [mpFormJobPlan, setMpFormJobPlan] = useState('');

  // 1. Initial Load
  const loadInitialData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [sitesData, metersData, groupsData, assetsData, locsData, mpsData] = await Promise.all([
        apiClient.listOrganizations().then(orgs => orgs.flatMap(o => o.sites || [])),
        apiClient.listMeters(),
        apiClient.listMeterGroups(),
        apiClient.listAssets({ site_id: selectedSiteId }),
        apiClient.listLocations({ site_id: selectedSiteId }),
        apiClient.listMeasurePoints({ site_id: selectedSiteId }),
      ]);

      setSites(sitesData);
      setMeters(metersData);
      setMeterGroups(groupsData);
      setAssetsList(assetsData);
      setLocationsList(locsData);
      setMeasurePoints(mpsData);

      if (metersData.length > 0 && !meterFormId) {
        setMpFormMeterId(metersData[0].meter_id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load meter data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  // Reload equipment meters when selected asset / location / site changes
  const loadEquipmentMeters = async () => {
    if (!selectedSiteId) return;
    try {
      if (equipmentType === 'ASSET' && selectedAssetId) {
        const res = await apiClient.getAssetMeters(selectedSiteId, selectedAssetId);
        setAssetMeters(res.meters || []);
      } else if (equipmentType === 'LOCATION' && selectedLocationId) {
        const res = await apiClient.getLocationMeters(selectedSiteId, selectedLocationId);
        setLocationMeters(res.meters || []);
      }
    } catch (err: any) {
      console.error('Failed to load equipment meters:', err);
    }
  };

  useEffect(() => {
    loadEquipmentMeters();
  }, [equipmentType, selectedSiteId, selectedAssetId, selectedLocationId]);

  // Filtered Master Meters
  const filteredMeters = useMemo(() => {
    return meters.filter(m => {
      const matchSearch =
        !meterSearch ||
        m.meter_id.toLowerCase().includes(meterSearch.toLowerCase()) ||
        m.description.toLowerCase().includes(meterSearch.toLowerCase()) ||
        (m.unit_of_measure && m.unit_of_measure.toLowerCase().includes(meterSearch.toLowerCase()));
      const matchType = meterTypeFilter === 'ALL' || m.meter_type === meterTypeFilter;
      return matchSearch && matchType;
    });
  }, [meters, meterSearch, meterTypeFilter]);

  // Filtered Groups
  const filteredGroups = useMemo(() => {
    return meterGroups.filter(g => {
      return (
        !groupSearch ||
        g.group_id.toLowerCase().includes(groupSearch.toLowerCase()) ||
        g.description.toLowerCase().includes(groupSearch.toLowerCase())
      );
    });
  }, [meterGroups, groupSearch]);

  // Filtered Measure Points
  const filteredMeasurePoints = useMemo(() => {
    return measurePoints.filter(p => {
      return (
        !mpSearch ||
        p.point_id.toLowerCase().includes(mpSearch.toLowerCase()) ||
        p.description.toLowerCase().includes(mpSearch.toLowerCase()) ||
        p.meter_id.toLowerCase().includes(mpSearch.toLowerCase()) ||
        (p.asset_id && p.asset_id.toLowerCase().includes(mpSearch.toLowerCase()))
      );
    });
  }, [measurePoints, mpSearch]);

  // ---- Handlers: Master Meters ----
  const handleSaveMeter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!meterFormId || !meterFormDesc) return;
    setLoading(true);
    try {
      const domainValsArray = meterFormDomainVals
        ? meterFormDomainVals.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
        : [];

      if (editingMeter) {
        const updated = await apiClient.updateMeter(editingMeter.meter_id, {
          description: meterFormDesc,
          meter_type: meterFormType,
          reading_type: meterFormReadingType,
          unit_of_measure: meterFormUom || undefined,
          domain_values: domainValsArray.length > 0 ? domainValsArray : undefined,
        });
        setMeters(meters.map(m => (m.meter_id === updated.meter_id ? updated : m)));
      } else {
        const created = await apiClient.createMeter({
          meter_id: meterFormId.trim().toUpperCase(),
          description: meterFormDesc.trim(),
          meter_type: meterFormType,
          reading_type: meterFormReadingType,
          unit_of_measure: meterFormUom.trim() || undefined,
          domain_values: domainValsArray.length > 0 ? domainValsArray : undefined,
          status: 'ACTIVE',
        });
        setMeters([created, ...meters]);
      }
      setIsNewMeterOpen(false);
      setEditingMeter(null);
      setMeterFormId('');
      setMeterFormDesc('');
      setMeterFormUom('');
      setMeterFormDomainVals('');
    } catch (err: any) {
      alert(err.message || 'Failed to save meter');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteMeter = async (meterId: string) => {
    if (!confirm(`Delete master meter ${meterId}? This cannot be undone.`)) return;
    try {
      await apiClient.deleteMeter(meterId);
      setMeters(meters.filter(m => m.meter_id !== meterId));
    } catch (err: any) {
      alert(err.message || 'Failed to delete meter');
    }
  };

  // ---- Handlers: Meter Groups ----
  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupId || !newGroupDesc) return;
    setLoading(true);
    try {
      const created = await apiClient.createMeterGroup({
        group_id: newGroupId.trim().toUpperCase(),
        description: newGroupDesc.trim(),
      });
      setMeterGroups([created, ...meterGroups]);
      setIsNewGroupOpen(false);
      setNewGroupId('');
      setNewGroupDesc('');
    } catch (err: any) {
      alert(err.message || 'Failed to create group');
    } finally {
      setLoading(false);
    }
  };

  const handleAddMeterToGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGroupForMeter || !addMeterToGroupId) return;
    try {
      const updated = await apiClient.addMeterToGroup(selectedGroupForMeter, {
        meter_id: addMeterToGroupId,
        default_rollover: addMeterRollover ? parseFloat(addMeterRollover) : undefined,
      });
      setMeterGroups(meterGroups.map(g => (g.group_id === updated.group_id ? updated : g)));
      setIsAddMeterToGroupOpen(false);
      setAddMeterToGroupId('');
      setAddMeterRollover('');
    } catch (err: any) {
      alert(err.message || 'Failed to add meter to group');
    }
  };

  const handleRemoveMeterFromGroup = async (groupId: string, meterId: string) => {
    try {
      await apiClient.removeMeterFromGroup(groupId, meterId);
      const updated = await apiClient.getMeterGroup(groupId);
      setMeterGroups(meterGroups.map(g => (g.group_id === groupId ? updated : g)));
    } catch (err: any) {
      alert(err.message || 'Failed to remove meter from group');
    }
  };

  // ---- Handlers: Equipment Meters ----
  const handleAttachMeter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSiteId) return;
    setLoading(true);
    try {
      if (equipmentType === 'ASSET' && selectedAssetId) {
        if (attachMode === 'single' && attachMeterId) {
          const res = await apiClient.attachMeterToAsset(selectedSiteId, selectedAssetId, {
            meter_id: attachMeterId,
            rollover_point: attachRollover ? parseFloat(attachRollover) : undefined,
            initial_reading: attachInitReading ? parseFloat(attachInitReading) : 0,
            initial_reading_aln: attachInitAln || undefined,
          });
          setAssetMeters(res.meters);
        } else if (attachMode === 'group' && attachGroupId) {
          const res = await apiClient.attachMeterToAsset(selectedSiteId, selectedAssetId, {
            group_id: attachGroupId,
          });
          setAssetMeters(res.meters);
        }
      } else if (equipmentType === 'LOCATION' && selectedLocationId) {
        const res = await apiClient.attachMeterToLocation(selectedSiteId, selectedLocationId, {
          meter_id: attachMeterId || undefined,
          group_id: attachGroupId || undefined,
          rollover_point: attachRollover ? parseFloat(attachRollover) : undefined,
          initial_reading: attachInitReading ? parseFloat(attachInitReading) : 0,
          initial_reading_aln: attachInitAln || undefined,
        });
        setLocationMeters(res.meters);
      }
      setIsAttachOpen(false);
      setAttachMeterId('');
      setAttachGroupId('');
      setAttachRollover('');
      setAttachInitReading('0');
      setAttachInitAln('');
    } catch (err: any) {
      alert(err.message || 'Failed to attach meter');
    } finally {
      setLoading(false);
    }
  };

  const handleDetachMeter = async (meterId: string) => {
    if (!confirm(`Detach meter ${meterId}? Historical readings will remain in audit ledger.`)) return;
    try {
      if (equipmentType === 'ASSET' && selectedAssetId) {
        await apiClient.detachMeterFromAsset(selectedSiteId, selectedAssetId, meterId);
        setAssetMeters(assetMeters.filter(m => m.meter_id !== meterId));
      } else if (equipmentType === 'LOCATION' && selectedLocationId) {
        await apiClient.detachMeterFromLocation(selectedSiteId, selectedLocationId, meterId);
        setLocationMeters(locationMeters.filter(m => m.meter_id !== meterId));
      }
    } catch (err: any) {
      alert(err.message || 'Failed to detach meter');
    }
  };

  // ---- Reading Entry ----
  const handleOpenReadingModal = (m: AssetMeter | LocationMeter) => {
    setActiveReadingMeter(m);
    setReadingVal(m.last_reading !== null && m.last_reading !== undefined ? String(m.last_reading) : '');
    setReadingAln(m.last_reading_aln || '');
    setReadingRemarks('');
    setReadingManualRollover(false);
    setReadingBreachAlert(null);
    setReadingSuccessToast(null);
  };

  const handleSubmitReading = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeReadingMeter || !selectedSiteId) return;
    setLoading(true);
    setReadingBreachAlert(null);
    try {
      const valNum = readingVal ? parseFloat(readingVal) : undefined;
      const alnVal = readingAln ? readingAln.trim() : undefined;

      if (equipmentType === 'ASSET' && selectedAssetId) {
        const resp = await apiClient.recordAssetMeterReading(
          selectedSiteId,
          selectedAssetId,
          activeReadingMeter.meter_id,
          {
            reading_value: valNum,
            reading_aln: alnVal,
            inspector_id: readingInspector,
            workorder_id: readingWorkOrder || undefined,
            remarks: readingRemarks || undefined,
            is_rollover_manual: readingManualRollover,
          }
        );

        if (resp.asset_meter) {
          setAssetMeters(assetMeters.map(m => (m.meter_id === resp.asset_meter!.meter_id ? resp.asset_meter! : m)));
        }

        if (resp.breach_alert) {
          setReadingBreachAlert(resp.breach_alert);
        } else {
          setReadingSuccessToast(`Reading of ${valNum ?? alnVal} logged successfully.`);
          setTimeout(() => setActiveReadingMeter(null), 1200);
        }
      } else if (equipmentType === 'LOCATION' && selectedLocationId) {
        const resp = await apiClient.recordLocationMeterReading(
          selectedSiteId,
          selectedLocationId,
          activeReadingMeter.meter_id,
          {
            reading_value: valNum,
            reading_aln: alnVal,
            inspector_id: readingInspector,
            remarks: readingRemarks || undefined,
          }
        );

        if (resp.location_meter) {
          setLocationMeters(locationMeters.map(m => (m.meter_id === resp.location_meter.meter_id ? resp.location_meter : m)));
        }
        setReadingSuccessToast(`Reading of ${valNum ?? alnVal} logged successfully.`);
        setTimeout(() => setActiveReadingMeter(null), 1200);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to record meter reading');
    } finally {
      setLoading(false);
    }
  };

  // ---- Meter Reset / Replacement ----
  const handleResetMeter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeResetMeter || !selectedSiteId || !selectedAssetId) return;
    setLoading(true);
    try {
      const updated = await apiClient.resetAssetMeter(
        selectedSiteId,
        selectedAssetId,
        activeResetMeter.meter_id,
        {
          reset_type: resetType,
          new_initial_reading: resetNewInit ? parseFloat(resetNewInit) : 0,
          rollover_point: resetRollover ? parseFloat(resetRollover) : undefined,
          remarks: resetRemarks || undefined,
        }
      );
      setAssetMeters(assetMeters.map(m => (m.meter_id === updated.meter_id ? updated : m)));
      setActiveResetMeter(null);
    } catch (err: any) {
      alert(err.message || 'Failed to reset meter');
    } finally {
      setLoading(false);
    }
  };

  // ---- Reading History Ledger ----
  const handleOpenHistory = async (m: AssetMeter) => {
    setHistoryMeter(m);
    setIsHistoryLoading(true);
    try {
      const list = await apiClient.getAssetMeterReadings(selectedSiteId, selectedAssetId, m.meter_id);
      setMeterReadingsList(list);
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsHistoryLoading(false);
    }
  };

  // ---- Measure Points (Condition Monitoring) ----
  const handleCreateMeasurePoint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mpFormId || !mpFormDesc || !mpFormMeterId) return;
    setLoading(true);
    try {
      const created = await apiClient.createMeasurePoint({
        point_id: mpFormId.trim().toUpperCase(),
        description: mpFormDesc.trim(),
        site_id: selectedSiteId,
        asset_id: mpFormAssetId ? mpFormAssetId.trim().toUpperCase() : undefined,
        meter_id: mpFormMeterId.trim().toUpperCase(),
        upper_action_limit: mpFormUpperAction ? parseFloat(mpFormUpperAction) : undefined,
        lower_action_limit: mpFormLowerAction ? parseFloat(mpFormLowerAction) : undefined,
        upper_warning_limit: mpFormUpperWarn ? parseFloat(mpFormUpperWarn) : undefined,
        lower_warning_limit: mpFormLowerWarn ? parseFloat(mpFormLowerWarn) : undefined,
        action_aln_value: mpFormAlnVal ? mpFormAlnVal.trim() : undefined,
        action_description: mpFormActionDesc ? mpFormActionDesc.trim() : undefined,
        action_job_plan: mpFormJobPlan ? mpFormJobPlan.trim() : undefined,
        action_priority: 1,
      });
      setMeasurePoints([created, ...measurePoints]);
      setIsNewMpOpen(false);
      setMpFormId('');
      setMpFormDesc('');
      setMpFormUpperAction('');
      setMpFormLowerAction('');
      setMpFormUpperWarn('');
      setMpFormLowerWarn('');
      setMpFormAlnVal('');
      setMpFormActionDesc('');
      setMpFormJobPlan('');
    } catch (err: any) {
      alert(err.message || 'Failed to create measure point');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteMeasurePoint = async (pointId: string) => {
    if (!confirm(`Delete measure point ${pointId}?`)) return;
    try {
      await apiClient.deleteMeasurePoint(pointId);
      setMeasurePoints(measurePoints.filter(p => p.point_id !== pointId));
    } catch (err: any) {
      alert(err.message || 'Failed to delete measure point');
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-white min-h-0 overflow-hidden select-none">
      {/* Top Header & Sub-Tab Bar */}
      <div className="flex flex-col border-b border-gray-200 bg-white px-5 pt-3.5 pb-0 shrink-0">
        <div className="flex items-center justify-between pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-700 border border-slate-200">
              <Gauge className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="text-sm font-bold text-gray-900 tracking-tight">
                  Meters & Condition Monitoring
                </h1>
                <InfoTooltip text="Master meter catalog (Continuous runtime counters, Gauge fluctuating metrics, Characteristic qualitative observations), standardized meter group bundles, active equipment meter tracking with rollover arithmetic, and real-time condition monitoring alert limits." />
              </div>
              <p className="text-[11px] text-gray-500">
                Enterprise equipment runhours, delta calculation, dial rollover arithmetic, and condition alerts
              </p>
            </div>
          </div>

          {/* Site Selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 font-medium">Site:</span>
            <select
              value={selectedSiteId}
              onChange={(e) => setSelectedSiteId(e.target.value)}
              className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 shadow-2xs focus:border-blue-500 focus:outline-none"
            >
              {sites.map(s => (
                <option key={s.site_id} value={s.site_id}>{s.site_id} - {s.name}</option>
              ))}
            </select>
            <button
              onClick={loadInitialData}
              title="Refresh meters"
              className="rounded-md border border-gray-200 p-1 text-gray-500 hover:bg-gray-100 transition-colors"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Sub Tabs Navigation */}
        <div className="flex items-center gap-6 text-xs font-medium border-t border-gray-100 pt-2">
          <button
            type="button"
            onClick={() => setActiveTab('equipment')}
            className={`pb-2.5 flex items-center gap-1.5 border-b-2 transition-colors ${
              activeTab === 'equipment'
                ? 'border-blue-600 text-blue-700 font-semibold'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            <Cpu className="h-3.5 w-3.5" />
            <span>Equipment Meters</span>
            <span className="ml-1 rounded-full bg-gray-100 px-1.5 py-0.2 text-[10px] text-gray-600 font-mono">
              {equipmentType === 'ASSET' ? assetMeters.length : locationMeters.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('catalog')}
            className={`pb-2.5 flex items-center gap-1.5 border-b-2 transition-colors ${
              activeTab === 'catalog'
                ? 'border-blue-600 text-blue-700 font-semibold'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            <Gauge className="h-3.5 w-3.5" />
            <span>Master Meters Catalog</span>
            <span className="ml-1 rounded-full bg-gray-100 px-1.5 py-0.2 text-[10px] text-gray-600 font-mono">
              {meters.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('groups')}
            className={`pb-2.5 flex items-center gap-1.5 border-b-2 transition-colors ${
              activeTab === 'groups'
                ? 'border-blue-600 text-blue-700 font-semibold'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>Meter Groups</span>
            <span className="ml-1 rounded-full bg-gray-100 px-1.5 py-0.2 text-[10px] text-gray-600 font-mono">
              {meterGroups.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('condition')}
            className={`pb-2.5 flex items-center gap-1.5 border-b-2 transition-colors ${
              activeTab === 'condition'
                ? 'border-blue-600 text-blue-700 font-semibold'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>Condition Monitoring</span>
            <span className="ml-1 rounded-full bg-gray-100 px-1.5 py-0.2 text-[10px] text-gray-600 font-mono">
              {measurePoints.length}
            </span>
          </button>
        </div>
      </div>

      {/* Main Tab Content */}
      <div className="flex-1 overflow-hidden min-h-0 bg-slate-50/40 p-4">
        {/* ================================================================= */}
        {/* TAB 1: MASTER METERS CATALOG */}
        {/* ================================================================= */}
        {activeTab === 'catalog' && (
          <div className="flex flex-col h-full rounded-xl border border-gray-200/80 bg-white shadow-2xs overflow-hidden">
            {/* Toolbar */}
            <div className="flex items-center justify-between border-b border-gray-100 p-3 bg-white">
              <div className="flex items-center gap-2.5 flex-1 max-w-md">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-gray-400" />
                  <input
                    type="text"
                    value={meterSearch}
                    onChange={(e) => setMeterSearch(e.target.value)}
                    placeholder="Search meter ID, description, UOM..."
                    className="w-full rounded-md border border-gray-200 pl-8 pr-3 py-1.5 text-xs text-gray-800 placeholder-gray-400 focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div className="flex items-center gap-1 bg-gray-100/80 rounded-md p-0.5 border border-gray-200">
                  {['ALL', 'CONTINUOUS', 'GAUGE', 'CHARACTERISTIC'].map((t) => (
                    <button
                      key={t}
                      onClick={() => setMeterTypeFilter(t)}
                      className={`px-2 py-1 text-[10px] font-semibold rounded transition-colors ${
                        meterTypeFilter === t
                          ? 'bg-white text-gray-900 shadow-2xs'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setEditingMeter(null);
                  setMeterFormId('');
                  setMeterFormDesc('');
                  setMeterFormType('CONTINUOUS');
                  setMeterFormReadingType('ACTUAL');
                  setMeterFormUom('');
                  setMeterFormDomainVals('');
                  setIsNewMeterOpen(true);
                }}
                className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-blue-700 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>New Master Meter</span>
              </button>
            </div>

            {/* Meters Table */}
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/70 text-[11px] font-semibold text-gray-600 uppercase tracking-wider">
                    <th className="px-4 py-2.5">Meter ID</th>
                    <th className="px-4 py-2.5">Description</th>
                    <th className="px-3 py-2.5">Type</th>
                    <th className="px-3 py-2.5">Reading Type</th>
                    <th className="px-3 py-2.5">UOM / Domain</th>
                    <th className="px-3 py-2.5 text-center">Active Attachments</th>
                    <th className="px-3 py-2.5">Status</th>
                    <th className="px-4 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-medium text-gray-700">
                  {filteredMeters.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-gray-400">
                        No master meters found matching criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredMeters.map((m) => (
                      <tr key={m.meter_id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-4 py-2.5 font-mono font-bold text-gray-900">
                          {m.meter_id}
                        </td>
                        <td className="px-4 py-2.5 text-gray-800">
                          {m.description}
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${
                              m.meter_type === 'CONTINUOUS'
                                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                : m.meter_type === 'GAUGE'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-purple-50 text-purple-700 border border-purple-200'
                            }`}
                          >
                            {m.meter_type}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-gray-600 font-mono text-[11px]">
                          {m.reading_type}
                        </td>
                        <td className="px-3 py-2.5">
                          {m.meter_type === 'CHARACTERISTIC' ? (
                            <span className="text-[11px] text-gray-600">
                              {(m.domain_values || []).join(', ') || 'ALN String'}
                            </span>
                          ) : (
                            <span className="font-mono text-gray-700 font-bold">
                              {m.unit_of_measure || '—'}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <span className="inline-flex items-center gap-1 rounded bg-gray-100 px-2 py-0.5 text-[10px] font-mono text-gray-700 font-bold">
                            <span>{(m.asset_usage_count || 0) + (m.location_usage_count || 0)}</span>
                            <span className="text-gray-400 font-normal">assets/locs</span>
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            {m.status}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingMeter(m);
                                setMeterFormId(m.meter_id);
                                setMeterFormDesc(m.description);
                                setMeterFormType(m.meter_type);
                                setMeterFormReadingType(m.reading_type);
                                setMeterFormUom(m.unit_of_measure || '');
                                setMeterFormDomainVals((m.domain_values || []).join(', '));
                                setIsNewMeterOpen(true);
                              }}
                              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                              title="Edit master meter"
                            >
                              <MoreVertical className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteMeter(m.meter_id)}
                              disabled={(m.asset_usage_count || 0) > 0 || (m.location_usage_count || 0) > 0}
                              className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400 transition-colors"
                              title="Delete master meter"
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 2: METER GROUPS */}
        {/* ================================================================= */}
        {activeTab === 'groups' && (
          <div className="flex flex-col h-full rounded-xl border border-gray-200/80 bg-white shadow-2xs overflow-hidden">
            {/* Toolbar */}
            <div className="flex items-center justify-between border-b border-gray-100 p-3 bg-white">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-gray-400" />
                <input
                  type="text"
                  value={groupSearch}
                  onChange={(e) => setGroupSearch(e.target.value)}
                  placeholder="Search meter group ID, description..."
                  className="w-full rounded-md border border-gray-200 pl-8 pr-3 py-1.5 text-xs text-gray-800 placeholder-gray-400 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <button
                type="button"
                onClick={() => setIsNewGroupOpen(true)}
                className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-blue-700 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>New Meter Group</span>
              </button>
            </div>

            {/* Groups Accordion List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {filteredGroups.length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-xs">
                  No meter groups found.
                </div>
              ) : (
                filteredGroups.map((grp) => {
                  const isExpanded = expandedGroupId === grp.group_id;
                  return (
                    <div
                      key={grp.group_id}
                      className="rounded-lg border border-gray-200 bg-white transition-all shadow-2xs overflow-hidden"
                    >
                      <div
                        onClick={() => setExpandedGroupId(isExpanded ? null : grp.group_id)}
                        className="flex items-center justify-between p-3.5 cursor-pointer hover:bg-slate-50/70 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            className="text-gray-400 hover:text-gray-700 transition-transform"
                          >
                            <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
                          </button>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-xs text-gray-900">{grp.group_id}</span>
                            <span className="text-xs text-gray-600 font-medium">— {grp.description}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-gray-100 text-gray-700">
                            {grp.meters?.length || 0} meters in group
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedGroupForMeter(grp.group_id);
                              setIsAddMeterToGroupOpen(true);
                            }}
                            className="rounded p-1 text-gray-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                            title="Add meter to group"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Expanded Child Meters */}
                      {isExpanded && (
                        <div className="border-t border-gray-100 bg-slate-50/50 p-3">
                          <table className="w-full text-left text-xs">
                            <thead>
                              <tr className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                                <th className="pb-2">Seq</th>
                                <th className="pb-2">Meter ID</th>
                                <th className="pb-2">Description</th>
                                <th className="pb-2">Type</th>
                                <th className="pb-2">UOM</th>
                                <th className="pb-2">Default Rollover</th>
                                <th className="pb-2 text-right">Remove</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 font-medium text-gray-700">
                              {(grp.meters || []).map((item) => (
                                <tr key={item.meter_id} className="hover:bg-white/80 transition-colors">
                                  <td className="py-1.5 font-mono text-[11px] text-gray-400">{item.sequence}</td>
                                  <td className="py-1.5 font-mono font-bold text-gray-900">{item.meter_id}</td>
                                  <td className="py-1.5 text-gray-700">{item.description}</td>
                                  <td className="py-1.5">
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-gray-100 text-gray-600">
                                      {item.meter_type}
                                    </span>
                                  </td>
                                  <td className="py-1.5 font-mono text-gray-600">{item.unit_of_measure || '—'}</td>
                                  <td className="py-1.5 font-mono text-gray-600">
                                    {item.default_rollover ? item.default_rollover.toLocaleString() : '—'}
                                  </td>
                                  <td className="py-1.5 text-right">
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveMeterFromGroup(grp.group_id, item.meter_id)}
                                      className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                                      title="Remove from group"
                                    >
                                      <Minus className="h-3 w-3" />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 3: EQUIPMENT METERS (ASSETS & LOCATIONS) */}
        {/* ================================================================= */}
        {activeTab === 'equipment' && (
          <div className="flex flex-col h-full rounded-xl border border-gray-200/80 bg-white shadow-2xs overflow-hidden">
            {/* Equipment Selection Toolbar */}
            <div className="flex items-center justify-between border-b border-gray-100 p-3 bg-white">
              <div className="flex items-center gap-3">
                {/* Equipment Type Toggle */}
                <div className="flex items-center bg-gray-100 rounded-md p-0.5 border border-gray-200">
                  <button
                    type="button"
                    onClick={() => setEquipmentType('ASSET')}
                    className={`px-3 py-1 text-xs font-semibold rounded transition-colors ${
                      equipmentType === 'ASSET'
                        ? 'bg-white text-gray-900 shadow-2xs'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Asset Meters
                  </button>
                  <button
                    type="button"
                    onClick={() => setEquipmentType('LOCATION')}
                    className={`px-3 py-1 text-xs font-semibold rounded transition-colors ${
                      equipmentType === 'LOCATION'
                        ? 'bg-white text-gray-900 shadow-2xs'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Location Meters
                  </button>
                </div>

                {/* Asset or Location Dropdown */}
                {equipmentType === 'ASSET' ? (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-500 font-medium">Asset:</span>
                    <select
                      value={selectedAssetId}
                      onChange={(e) => setSelectedAssetId(e.target.value)}
                      className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 shadow-2xs focus:border-blue-500 focus:outline-none"
                    >
                      {assetsList.map((a) => (
                        <option key={a.asset_id} value={a.asset_id}>
                          {a.asset_id} — {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-500 font-medium">Location:</span>
                    <select
                      value={selectedLocationId}
                      onChange={(e) => setSelectedLocationId(e.target.value)}
                      className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 shadow-2xs focus:border-blue-500 focus:outline-none"
                    >
                      {locationsList.map((l) => (
                        <option key={l.location_id} value={l.location_id}>
                          {l.location_id} — {l.description}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsAttachOpen(true)}
                  className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-blue-700 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Attach Meter / Group</span>
                </button>
              </div>
            </div>

            {/* Active Meters Table */}
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/70 text-[11px] font-semibold text-gray-600 uppercase tracking-wider">
                    <th className="px-4 py-2.5">Meter ID</th>
                    <th className="px-3 py-2.5">Type</th>
                    <th className="px-4 py-2.5">Last Reading</th>
                    <th className="px-3 py-2.5">Last Reading Date</th>
                    <th className="px-3 py-2.5">Rollover Point</th>
                    <th className="px-3 py-2.5">Life to Date (LTD)</th>
                    {equipmentType === 'ASSET' && <th className="px-3 py-2.5">Since Overhaul</th>}
                    {equipmentType === 'ASSET' && <th className="px-3 py-2.5">Since Repair</th>}
                    <th className="px-3 py-2.5">Avg / Day</th>
                    <th className="px-4 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-medium text-gray-700">
                  {((equipmentType === 'ASSET' ? assetMeters : locationMeters) || []).length === 0 ? (
                    <tr>
                      <td colSpan={10} className="p-8 text-center text-gray-400">
                        No meters attached to this {equipmentType.toLowerCase()}. Click "Attach Meter / Group" above.
                      </td>
                    </tr>
                  ) : (
                    (equipmentType === 'ASSET' ? assetMeters : locationMeters).map((m: any) => (
                      <tr key={m.meter_id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex flex-col">
                            <span className="font-mono font-bold text-gray-900">{m.meter_id}</span>
                            <span className="text-[11px] text-gray-500">{m.description}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                              m.meter_type === 'CONTINUOUS'
                                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                : m.meter_type === 'GAUGE'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-purple-50 text-purple-700 border border-purple-200'
                            }`}
                          >
                            {m.meter_type}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {m.meter_type === 'CHARACTERISTIC' ? (
                            <span className="font-bold text-purple-800 bg-purple-50 px-2 py-0.5 rounded border border-purple-200 font-mono text-[11px]">
                              {m.last_reading_aln || '—'}
                            </span>
                          ) : (
                            <div className="flex items-center gap-1 font-mono font-bold text-gray-900 text-[13px]">
                              <span>{m.last_reading !== null ? m.last_reading.toLocaleString() : '—'}</span>
                              <span className="text-[10px] text-gray-500 font-normal">{m.unit_of_measure}</span>
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3 text-gray-500 text-[11px]">
                          {m.last_reading_date ? new Date(m.last_reading_date).toLocaleDateString() : '—'}
                        </td>
                        <td className="px-3 py-3 font-mono text-gray-600">
                          {m.rollover_point ? m.rollover_point.toLocaleString() : '—'}
                        </td>
                        <td className="px-3 py-3 font-mono font-bold text-slate-800">
                          {m.life_to_date ? m.life_to_date.toLocaleString() : '0'} {m.unit_of_measure}
                        </td>
                        {equipmentType === 'ASSET' && (
                          <td className="px-3 py-3 font-mono text-gray-700">
                            {m.since_last_overhaul !== undefined ? m.since_last_overhaul.toLocaleString() : '0'}
                          </td>
                        )}
                        {equipmentType === 'ASSET' && (
                          <td className="px-3 py-3 font-mono text-gray-700">
                            {m.since_last_repair !== undefined ? m.since_last_repair.toLocaleString() : '0'}
                          </td>
                        )}
                        <td className="px-3 py-3 font-mono text-gray-600">
                          {m.avg_units_per_day > 0 ? `${m.avg_units_per_day} / d` : '—'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* 1-Click Enter Reading Button */}
                            <button
                              type="button"
                              onClick={() => handleOpenReadingModal(m)}
                              className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors"
                              title="Enter new reading"
                            >
                              <Activity className="h-3 w-3" />
                              <span>Log Reading</span>
                            </button>

                            {/* Reset Button (Overhaul / Repair / Replace) */}
                            {equipmentType === 'ASSET' && m.meter_type === 'CONTINUOUS' && (
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveResetMeter(m);
                                  setResetType('OVERHAUL');
                                  setResetNewInit('0');
                                  setResetRollover(m.rollover_point ? String(m.rollover_point) : '');
                                  setResetRemarks('');
                                }}
                                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                                title="Reset / Replace Meter"
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                              </button>
                            )}

                            {/* History Ledger Button */}
                            {equipmentType === 'ASSET' && (
                              <button
                                type="button"
                                onClick={() => handleOpenHistory(m)}
                                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                                title="View reading history ledger"
                              >
                                <History className="h-3.5 w-3.5" />
                              </button>
                            )}

                            {/* Detach Meter Button */}
                            <button
                              type="button"
                              onClick={() => handleDetachMeter(m.meter_id)}
                              className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                              title="Detach meter"
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 4: CONDITION MONITORING (MEASURE POINTS) */}
        {/* ================================================================= */}
        {activeTab === 'condition' && (
          <div className="flex flex-col h-full rounded-xl border border-gray-200/80 bg-white shadow-2xs overflow-hidden">
            {/* Toolbar */}
            <div className="flex items-center justify-between border-b border-gray-100 p-3 bg-white">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-gray-400" />
                <input
                  type="text"
                  value={mpSearch}
                  onChange={(e) => setMpSearch(e.target.value)}
                  placeholder="Search measure point ID, description, meter, asset..."
                  className="w-full rounded-md border border-gray-200 pl-8 pr-3 py-1.5 text-xs text-gray-800 placeholder-gray-400 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <button
                type="button"
                onClick={() => setIsNewMpOpen(true)}
                className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-blue-700 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>New Measure Point</span>
              </button>
            </div>

            {/* Measure Points Table */}
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/70 text-[11px] font-semibold text-gray-600 uppercase tracking-wider">
                    <th className="px-4 py-2.5">Point ID</th>
                    <th className="px-4 py-2.5">Description</th>
                    <th className="px-3 py-2.5">Target Equipment</th>
                    <th className="px-3 py-2.5">Meter ID</th>
                    <th className="px-3 py-2.5">Warning Limits</th>
                    <th className="px-3 py-2.5">Action Limits</th>
                    <th className="px-3 py-2.5">Breach Alert Status</th>
                    <th className="px-3 py-2.5">Action Plan</th>
                    <th className="px-4 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-medium text-gray-700">
                  {filteredMeasurePoints.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-gray-400">
                        No condition monitoring measure points defined for site {selectedSiteId}.
                      </td>
                    </tr>
                  ) : (
                    filteredMeasurePoints.map((pt) => {
                      const hasBreach = Boolean(pt.last_breach_type);
                      return (
                        <tr key={pt.point_id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="px-4 py-3 font-mono font-bold text-gray-900">
                            {pt.point_id}
                          </td>
                          <td className="px-4 py-3 text-gray-800">
                            {pt.description}
                          </td>
                          <td className="px-3 py-3 font-mono font-semibold text-gray-700">
                            {pt.asset_id ? `Asset: ${pt.asset_id}` : `Loc: ${pt.location_id}`}
                          </td>
                          <td className="px-3 py-3 font-mono text-gray-700">
                            {pt.meter_id}
                          </td>
                          <td className="px-3 py-3 font-mono text-amber-800 text-[11px]">
                            {pt.lower_warning_limit !== null && pt.lower_warning_limit !== undefined && `L: ${pt.lower_warning_limit} `}
                            {pt.upper_warning_limit !== null && pt.upper_warning_limit !== undefined && `U: ${pt.upper_warning_limit}`}
                            {pt.lower_warning_limit === null && pt.upper_warning_limit === null && '—'}
                          </td>
                          <td className="px-3 py-3 font-mono text-red-700 font-bold text-[11px]">
                            {pt.action_aln_value ? `ALN: ${pt.action_aln_value}` : ''}
                            {pt.lower_action_limit !== null && pt.lower_action_limit !== undefined && `L: ${pt.lower_action_limit} `}
                            {pt.upper_action_limit !== null && pt.upper_action_limit !== undefined && `U: ${pt.upper_action_limit}`}
                          </td>
                          <td className="px-3 py-3">
                            {hasBreach ? (
                              <div className="flex flex-col">
                                <span className="inline-flex items-center gap-1 rounded bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700 border border-red-200">
                                  <AlertCircle className="h-3 w-3" />
                                  <span>{pt.last_breach_type}</span>
                                </span>
                                <span className="text-[10px] text-gray-500 mt-0.5">
                                  Val: {pt.last_breach_value} ({pt.last_breach_date ? new Date(pt.last_breach_date).toLocaleDateString() : ''})
                                </span>
                              </div>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200">
                                <CheckCircle2 className="h-3 w-3" />
                                <span>NORMAL</span>
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex flex-col">
                              <span className="text-gray-800 font-medium text-[11px]">{pt.action_description || '—'}</span>
                              {pt.action_job_plan && (
                                <span className="text-[10px] text-blue-700 font-mono">
                                  JP: {pt.action_job_plan} (Pri: {pt.action_priority})
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => handleDeleteMeasurePoint(pt.point_id)}
                              className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                              title="Delete measure point"
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ================================================================= */}
      {/* MODAL: NEW / EDIT MASTER METER */}
      {/* ================================================================= */}
      {isNewMeterOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-2xs p-4">
          <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5 bg-gray-50/60">
              <h2 className="text-xs font-bold uppercase tracking-wider text-gray-800">
                {editingMeter ? `Edit Master Meter: ${editingMeter.meter_id}` : 'Create Master Meter'}
              </h2>
              <button
                type="button"
                onClick={() => setIsNewMeterOpen(false)}
                className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveMeter} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                  Meter ID *
                </label>
                <input
                  type="text"
                  required
                  disabled={Boolean(editingMeter)}
                  value={meterFormId}
                  onChange={(e) => setMeterFormId(e.target.value.toUpperCase())}
                  placeholder="e.g. RUNHOURS, DISCHARGE_PSI, OIL_CONDITION"
                  className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-xs font-mono text-gray-800 focus:border-blue-500 focus:outline-none disabled:bg-gray-100"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                  Description *
                </label>
                <input
                  type="text"
                  required
                  value={meterFormDesc}
                  onChange={(e) => setMeterFormDesc(e.target.value)}
                  placeholder="e.g. Operating Runtime Hours Counter"
                  className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-xs text-gray-800 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                    Meter Type *
                  </label>
                  <select
                    value={meterFormType}
                    onChange={(e: any) => setMeterFormType(e.target.value)}
                    className="w-full rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-800 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="CONTINUOUS">CONTINUOUS (Cumulative)</option>
                    <option value="GAUGE">GAUGE (Fluctuating)</option>
                    <option value="CHARACTERISTIC">CHARACTERISTIC (Qualitative)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                    Reading Type
                  </label>
                  <select
                    value={meterFormReadingType}
                    onChange={(e: any) => setMeterFormReadingType(e.target.value)}
                    className="w-full rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-800 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="ACTUAL">ACTUAL (Dial value)</option>
                    <option value="DELTA">DELTA (Difference)</option>
                  </select>
                </div>
              </div>

              {meterFormType !== 'CHARACTERISTIC' ? (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                    Unit of Measure (UOM)
                  </label>
                  <input
                    type="text"
                    value={meterFormUom}
                    onChange={(e) => setMeterFormUom(e.target.value.toUpperCase())}
                    placeholder="e.g. HOURS, PSI, MM/S, DEG_C, KWH"
                    className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-xs font-mono text-gray-800 focus:border-blue-500 focus:outline-none"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                    Domain Values (comma-separated ALN observations)
                  </label>
                  <input
                    type="text"
                    value={meterFormDomainVals}
                    onChange={(e) => setMeterFormDomainVals(e.target.value.toUpperCase())}
                    placeholder="e.g. CLEAR, AMBER, DARK, BURNT"
                    className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-xs font-mono text-gray-800 focus:border-blue-500 focus:outline-none"
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsNewMeterOpen(false)}
                  className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-md bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? 'Saving...' : 'Save Meter'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL: CREATE METER GROUP */}
      {/* ================================================================= */}
      {isNewGroupOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-2xs p-4">
          <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5 bg-gray-50/60">
              <h2 className="text-xs font-bold uppercase tracking-wider text-gray-800">
                Create Meter Group Template
              </h2>
              <button
                type="button"
                onClick={() => setIsNewGroupOpen(false)}
                className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateGroup} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                  Group ID *
                </label>
                <input
                  type="text"
                  required
                  value={newGroupId}
                  onChange={(e) => setNewGroupId(e.target.value.toUpperCase())}
                  placeholder="e.g. MG_PUMP_CENT, MG_MOTOR_ELEC"
                  className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-xs font-mono text-gray-800 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                  Description *
                </label>
                <input
                  type="text"
                  required
                  value={newGroupDesc}
                  onChange={(e) => setNewGroupDesc(e.target.value)}
                  placeholder="e.g. Centrifugal Pump Standard Meter Group"
                  className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-xs text-gray-800 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsNewGroupOpen(false)}
                  className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-md bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? 'Creating...' : 'Create Group'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL: ADD METER TO GROUP */}
      {/* ================================================================= */}
      {isAddMeterToGroupOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-2xs p-4">
          <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5 bg-gray-50/60">
              <h2 className="text-xs font-bold uppercase tracking-wider text-gray-800">
                Add Meter to Group: {selectedGroupForMeter}
              </h2>
              <button
                type="button"
                onClick={() => setIsAddMeterToGroupOpen(false)}
                className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleAddMeterToGroup} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                  Select Master Meter *
                </label>
                <select
                  required
                  value={addMeterToGroupId}
                  onChange={(e) => setAddMeterToGroupId(e.target.value)}
                  className="w-full rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-800 focus:border-blue-500 focus:outline-none"
                >
                  <option value="">-- Choose Meter --</option>
                  {meters.map(m => (
                    <option key={m.meter_id} value={m.meter_id}>
                      {m.meter_id} — {m.description} ({m.meter_type})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                  Default Rollover Point (Optional)
                </label>
                <input
                  type="number"
                  value={addMeterRollover}
                  onChange={(e) => setAddMeterRollover(e.target.value)}
                  placeholder="e.g. 100000"
                  className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-xs font-mono text-gray-800 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsAddMeterToGroupOpen(false)}
                  className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!addMeterToGroupId}
                  className="rounded-md bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-blue-700 disabled:opacity-50"
                >
                  Add to Group
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL: ATTACH METER OR GROUP TO EQUIPMENT */}
      {/* ================================================================= */}
      {isAttachOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-2xs p-4">
          <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5 bg-gray-50/60">
              <h2 className="text-xs font-bold uppercase tracking-wider text-gray-800">
                Attach to {equipmentType === 'ASSET' ? `Asset ${selectedAssetId}` : `Location ${selectedLocationId}`}
              </h2>
              <button
                type="button"
                onClick={() => setIsAttachOpen(false)}
                className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleAttachMeter} className="p-5 space-y-4">
              {/* Mode Toggle */}
              <div className="flex items-center bg-gray-100 rounded-md p-0.5 border border-gray-200">
                <button
                  type="button"
                  onClick={() => setAttachMode('single')}
                  className={`flex-1 py-1 text-xs font-semibold rounded transition-colors ${
                    attachMode === 'single' ? 'bg-white text-gray-900 shadow-2xs' : 'text-gray-600'
                  }`}
                >
                  Single Meter
                </button>
                <button
                  type="button"
                  onClick={() => setAttachMode('group')}
                  className={`flex-1 py-1 text-xs font-semibold rounded transition-colors ${
                    attachMode === 'group' ? 'bg-white text-gray-900 shadow-2xs' : 'text-gray-600'
                  }`}
                >
                  Apply Meter Group
                </button>
              </div>

              {attachMode === 'single' ? (
                <>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                      Select Master Meter *
                    </label>
                    <select
                      required
                      value={attachMeterId}
                      onChange={(e) => setAttachMeterId(e.target.value)}
                      className="w-full rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-800 focus:border-blue-500 focus:outline-none"
                    >
                      <option value="">-- Choose Meter --</option>
                      {meters.map(m => (
                        <option key={m.meter_id} value={m.meter_id}>
                          {m.meter_id} — {m.description} ({m.meter_type})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                        Initial Reading
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={attachInitReading}
                        onChange={(e) => setAttachInitReading(e.target.value)}
                        className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-xs font-mono text-gray-800 focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                        Rollover Point
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={attachRollover}
                        onChange={(e) => setAttachRollover(e.target.value)}
                        placeholder="e.g. 100000"
                        className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-xs font-mono text-gray-800 focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                    Select Meter Group *
                  </label>
                  <select
                    required
                    value={attachGroupId}
                    onChange={(e) => setAttachGroupId(e.target.value)}
                    className="w-full rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-800 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">-- Choose Meter Group Template --</option>
                    {meterGroups.map(g => (
                      <option key={g.group_id} value={g.group_id}>
                        {g.group_id} — {g.description} ({g.meters?.length || 0} meters)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsAttachOpen(false)}
                  className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-md bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? 'Attaching...' : 'Attach Now'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL: LOG NEW METER READING (1-Click Workbench) */}
      {/* ================================================================= */}
      {activeReadingMeter && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-2xs p-4">
          <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5 bg-gray-50/60">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-blue-600" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-gray-800">
                  Log Reading: {activeReadingMeter.meter_id}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setActiveReadingMeter(null)}
                className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitReading} className="p-5 space-y-4">
              {/* Previous Value Display */}
              <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3 border border-slate-200/70">
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase font-bold text-gray-400">Previous Reading</span>
                  <span className="font-mono font-bold text-sm text-gray-800">
                    {activeReadingMeter.meter_type === 'CHARACTERISTIC'
                      ? activeReadingMeter.last_reading_aln || 'None'
                      : `${activeReadingMeter.last_reading !== null && activeReadingMeter.last_reading !== undefined ? activeReadingMeter.last_reading.toLocaleString() : '0'} ${activeReadingMeter.unit_of_measure || ''}`}
                  </span>
                </div>
                {activeReadingMeter.rollover_point && (
                  <div className="flex flex-col text-right">
                    <span className="text-[10px] uppercase font-bold text-gray-400">Rollover Limit</span>
                    <span className="font-mono font-bold text-xs text-gray-600">
                      {activeReadingMeter.rollover_point.toLocaleString()}
                    </span>
                  </div>
                )}
              </div>

              {/* Input Field */}
              {activeReadingMeter.meter_type === 'CHARACTERISTIC' ? (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                    Characteristic Observation *
                  </label>
                  {activeReadingMeter.domain_values && activeReadingMeter.domain_values.length > 0 ? (
                    <select
                      required
                      value={readingAln}
                      onChange={(e) => setReadingAln(e.target.value)}
                      className="w-full rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-800 focus:border-blue-500 focus:outline-none"
                    >
                      <option value="">-- Select Observation --</option>
                      {activeReadingMeter.domain_values.map((v) => (
                        <option key={v} value={v}>{v}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      required
                      value={readingAln}
                      onChange={(e) => setReadingAln(e.target.value)}
                      placeholder="e.g. CLEAR, PASS, NORMAL"
                      className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-xs text-gray-800 focus:border-blue-500 focus:outline-none"
                    />
                  )}
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                    New Reading Value * ({activeReadingMeter.unit_of_measure || 'units'})
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={readingVal}
                    onChange={(e) => setReadingVal(e.target.value)}
                    placeholder="Enter current dial reading"
                    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm font-mono font-bold text-gray-900 focus:border-blue-500 focus:outline-none"
                  />
                </div>
              )}

              {/* Rollover Confirm checkbox if lower reading */}
              {activeReadingMeter.meter_type === 'CONTINUOUS' &&
                readingVal &&
                activeReadingMeter.last_reading !== null &&
                activeReadingMeter.last_reading !== undefined &&
                parseFloat(readingVal) < activeReadingMeter.last_reading &&
                !activeReadingMeter.rollover_point && (
                  <label className="flex items-center gap-2 rounded bg-amber-50 p-2.5 border border-amber-200 text-xs text-amber-900 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={readingManualRollover}
                      onChange={(e) => setReadingManualRollover(e.target.checked)}
                      className="rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                    />
                    <span>Confirm dial rollover cycle (reading is lower than previous).</span>
                  </label>
                )}

              {/* Inspector & Work Order */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                    Inspector ID
                  </label>
                  <input
                    type="text"
                    value={readingInspector}
                    onChange={(e) => setReadingInspector(e.target.value)}
                    className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-xs text-gray-800 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                    Work Order #
                  </label>
                  <input
                    type="text"
                    value={readingWorkOrder}
                    onChange={(e) => setReadingWorkOrder(e.target.value)}
                    placeholder="Optional WO"
                    className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-xs text-gray-800 focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                  Remarks / Notes
                </label>
                <input
                  type="text"
                  value={readingRemarks}
                  onChange={(e) => setReadingRemarks(e.target.value)}
                  placeholder="e.g. Routine round check"
                  className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-xs text-gray-800 focus:border-blue-500 focus:outline-none"
                />
              </div>

              {/* Real-Time Condition Monitoring Breach Alert */}
              {readingBreachAlert && (
                <div className="rounded-lg bg-red-50 p-3 border border-red-200 text-xs text-red-900 space-y-1 animate-in fade-in">
                  <div className="flex items-center gap-1.5 font-bold text-red-700">
                    <AlertCircle className="h-4 w-4" />
                    <span>LIMIT BREACH DETECTED: {readingBreachAlert.breach_type}</span>
                  </div>
                  <p className="text-[11px] text-red-800">{readingBreachAlert.action_description}</p>
                  {readingBreachAlert.action_job_plan && (
                    <div className="font-mono text-[10px] text-red-900 font-bold">
                      Automated Action Job Plan: {readingBreachAlert.action_job_plan} (Priority {readingBreachAlert.action_priority})
                    </div>
                  )}
                </div>
              )}

              {/* Toast Message */}
              {readingSuccessToast && (
                <div className="rounded-lg bg-emerald-50 p-2.5 border border-emerald-200 text-xs font-semibold text-emerald-800 flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span>{readingSuccessToast}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setActiveReadingMeter(null)}
                  className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-md bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? 'Submitting...' : 'Save Reading'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL: RESET / REPLACE METER */}
      {/* ================================================================= */}
      {activeResetMeter && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-2xs p-4">
          <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5 bg-gray-50/60">
              <h2 className="text-xs font-bold uppercase tracking-wider text-gray-800">
                Reset / Replace Meter: {activeResetMeter.meter_id}
              </h2>
              <button
                type="button"
                onClick={() => setActiveResetMeter(null)}
                className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleResetMeter} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                  Reset Operation Type *
                </label>
                <select
                  value={resetType}
                  onChange={(e: any) => setResetType(e.target.value)}
                  className="w-full rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-800 focus:border-blue-500 focus:outline-none"
                >
                  <option value="OVERHAUL">Major Overhaul (Zero Since-Overhaul Counter)</option>
                  <option value="REPAIR">Component Repair (Zero Since-Repair Counter)</option>
                  <option value="REPLACE_METER">Physical Meter Dial Replacement</option>
                </select>
              </div>

              {resetType === 'REPLACE_METER' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                      New Starting Reading
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={resetNewInit}
                      onChange={(e) => setResetNewInit(e.target.value)}
                      className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-xs font-mono text-gray-800 focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                      New Rollover Point
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={resetRollover}
                      onChange={(e) => setResetRollover(e.target.value)}
                      className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-xs font-mono text-gray-800 focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                  Work Description / Remarks
                </label>
                <input
                  type="text"
                  value={resetRemarks}
                  onChange={(e) => setResetRemarks(e.target.value)}
                  placeholder="e.g. Pump rebuild completed under WO-1049"
                  className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-xs text-gray-800 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setActiveResetMeter(null)}
                  className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-md bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? 'Processing...' : 'Confirm Reset'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* DRAWER: METER READINGS LEDGER HISTORY */}
      {/* ================================================================= */}
      {historyMeter && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-2xs">
          <div className="w-full max-w-xl h-full bg-white shadow-2xl flex flex-col border-l border-gray-200 animate-in slide-in-from-right duration-200">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5 bg-gray-50/70">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-blue-600" />
                <div>
                  <h2 className="text-xs font-bold uppercase tracking-wider text-gray-900">
                    Immutable Reading Ledger: {historyMeter.meter_id}
                  </h2>
                  <p className="text-[10px] text-gray-500">
                    Asset {historyMeter.asset_id} • Life to date: {historyMeter.life_to_date} {historyMeter.unit_of_measure}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setHistoryMeter(null)}
                className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Ledger Content */}
            <div className="flex-1 overflow-y-auto p-4">
              {isHistoryLoading ? (
                <div className="p-8 text-center text-xs text-gray-400">Loading ledger readings...</div>
              ) : meterReadingsList.length === 0 ? (
                <div className="p-8 text-center text-xs text-gray-400">No historical readings recorded yet.</div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/50 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                      <th className="py-2 px-2">Date & Time</th>
                      <th className="py-2 px-2">Reading</th>
                      <th className="py-2 px-2">Delta</th>
                      <th className="py-2 px-2">Inspector</th>
                      <th className="py-2 px-2">WO #</th>
                      <th className="py-2 px-2">Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 font-medium text-gray-700">
                    {meterReadingsList.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50/70">
                        <td className="py-2 px-2 font-mono text-[11px] text-gray-600">
                          {r.reading_date ? new Date(r.reading_date).toLocaleString() : '—'}
                        </td>
                        <td className="py-2 px-2 font-mono font-bold text-gray-900">
                          {r.reading_value !== null && r.reading_value !== undefined
                            ? r.reading_value.toLocaleString()
                            : r.reading_aln}
                        </td>
                        <td className="py-2 px-2 font-mono text-blue-700">
                          {r.delta_value !== null && r.delta_value !== undefined ? (
                            <span>+{r.delta_value.toLocaleString()}</span>
                          ) : '—'}
                        </td>
                        <td className="py-2 px-2 text-gray-600">{r.inspector_id || '—'}</td>
                        <td className="py-2 px-2 font-mono text-[11px] text-gray-600">{r.workorder_id || '—'}</td>
                        <td className="py-2 px-2 text-gray-500 text-[11px]">{r.remarks || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL: NEW MEASURE POINT (CONDITION MONITORING) */}
      {/* ================================================================= */}
      {isNewMpOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-2xs p-4">
          <div className="w-full max-w-lg rounded-xl border border-gray-200 bg-white shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5 bg-gray-50/60">
              <h2 className="text-xs font-bold uppercase tracking-wider text-gray-800">
                Create Condition Monitoring Measure Point
              </h2>
              <button
                type="button"
                onClick={() => setIsNewMpOpen(false)}
                className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateMeasurePoint} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                    Point ID *
                  </label>
                  <input
                    type="text"
                    required
                    value={mpFormId}
                    onChange={(e) => setMpFormId(e.target.value.toUpperCase())}
                    placeholder="e.g. MP_PUMP100_VIB"
                    className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-xs font-mono text-gray-800 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                    Target Meter *
                  </label>
                  <select
                    required
                    value={mpFormMeterId}
                    onChange={(e) => setMpFormMeterId(e.target.value)}
                    className="w-full rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-800 focus:border-blue-500 focus:outline-none"
                  >
                    {meters.map(m => (
                      <option key={m.meter_id} value={m.meter_id}>{m.meter_id} — {m.description}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                  Description *
                </label>
                <input
                  type="text"
                  required
                  value={mpFormDesc}
                  onChange={(e) => setMpFormDesc(e.target.value)}
                  placeholder="e.g. Centrifugal Pump Bearing Vibration Warning & Action Limits"
                  className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-xs text-gray-800 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                  Target Asset ID (Optional)
                </label>
                <select
                  value={mpFormAssetId}
                  onChange={(e) => setMpFormAssetId(e.target.value)}
                  className="w-full rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-800 focus:border-blue-500 focus:outline-none"
                >
                  <option value="">-- All Equipment or Select Asset --</option>
                  {assetsList.map(a => (
                    <option key={a.asset_id} value={a.asset_id}>{a.asset_id} — {a.name}</option>
                  ))}
                </select>
              </div>

              {/* Limits */}
              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200/70">
                <div>
                  <label className="block text-[11px] font-bold text-amber-800 mb-1">Upper Warning Limit</label>
                  <input
                    type="number"
                    step="any"
                    value={mpFormUpperWarn}
                    onChange={(e) => setMpFormUpperWarn(e.target.value)}
                    placeholder="e.g. 3.5"
                    className="w-full rounded border border-gray-200 px-2 py-1 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-red-800 mb-1">Upper Action Limit</label>
                  <input
                    type="number"
                    step="any"
                    value={mpFormUpperAction}
                    onChange={(e) => setMpFormUpperAction(e.target.value)}
                    placeholder="e.g. 4.5"
                    className="w-full rounded border border-gray-200 px-2 py-1 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-amber-800 mb-1">Lower Warning Limit</label>
                  <input
                    type="number"
                    step="any"
                    value={mpFormLowerWarn}
                    onChange={(e) => setMpFormLowerWarn(e.target.value)}
                    placeholder="Optional lower warn"
                    className="w-full rounded border border-gray-200 px-2 py-1 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-red-800 mb-1">Lower Action Limit</label>
                  <input
                    type="number"
                    step="any"
                    value={mpFormLowerAction}
                    onChange={(e) => setMpFormLowerAction(e.target.value)}
                    placeholder="Optional lower action"
                    className="w-full rounded border border-gray-200 px-2 py-1 text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                  Characteristic Action Value (For qualitative meters)
                </label>
                <input
                  type="text"
                  value={mpFormAlnVal}
                  onChange={(e) => setMpFormAlnVal(e.target.value.toUpperCase())}
                  placeholder="e.g. BURNT, DIRTY, FAIL"
                  className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-xs font-mono text-gray-800 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                    Action Description
                  </label>
                  <input
                    type="text"
                    value={mpFormActionDesc}
                    onChange={(e) => setMpFormActionDesc(e.target.value)}
                    placeholder="e.g. Trigger Bearing Alignment & Greasing"
                    className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-xs text-gray-800 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                    Action Job Plan
                  </label>
                  <input
                    type="text"
                    value={mpFormJobPlan}
                    onChange={(e) => setMpFormJobPlan(e.target.value)}
                    placeholder="e.g. JP_PUMP_VIB_INSPECT"
                    className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-xs text-gray-800 focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsNewMpOpen(false)}
                  className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-md bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? 'Creating...' : 'Create Measure Point'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
