import React, { useState, useEffect, useCallback } from 'react';
import {
  Tag,
  Sliders,
  Check,
  RefreshCw,
  Edit2,
  Plus,
  AlertCircle,
  X,
  ChevronRight,
  FolderTree,
} from 'lucide-react';
import { api } from '../../api/client';
import type {
  Classification,
  SpecValueItem,
  InstanceSpecificationResponse,
} from '../../types';
import { InfoTooltip } from '../people/InfoTooltip';

interface InstanceSpecificationsInspectorProps {
  targetType: 'asset' | 'location';
  siteId: string;
  instanceId: string;
  onSpecificationChanged?: () => void;
}

export const InstanceSpecificationsInspector: React.FC<InstanceSpecificationsInspectorProps> = ({
  targetType,
  siteId,
  instanceId,
  onSpecificationChanged,
}) => {
  const [data, setData] = useState<InstanceSpecificationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Form values map: attribute_id -> SpecValueItem
  const [values, setValues] = useState<Record<string, { aln?: string; num?: number; date?: string; uom?: string }>>({});

  // Classify Modal / Picker state
  const [isClassifyModalOpen, setIsClassifyModalOpen] = useState(false);
  const [availableClassifications, setAvailableClassifications] = useState<Classification[]>([]);
  const [loadingClasses, setLoadingClasses] = useState(false);

  const fetchSpecs = useCallback(async () => {
    setLoading(true);
    setSaveSuccess(false);
    try {
      const res =
        targetType === 'asset'
          ? await api.getAssetSpecifications(siteId, instanceId)
          : await api.getLocationSpecifications(siteId, instanceId);
      setData(res);

      const valMap: Record<string, { aln?: string; num?: number; date?: string; uom?: string }> = {};
      for (const s of res.specifications) {
        valMap[s.attribute_id] = {
          aln: s.aln_value || '',
          num: s.num_value !== null && s.num_value !== undefined ? s.num_value : undefined,
          date: s.date_value || '',
          uom: s.unit_of_measure || '',
        };
      }
      setValues(valMap);
    } catch (err) {
      console.error('Failed to load specifications:', err);
    } finally {
      setLoading(false);
    }
  }, [targetType, siteId, instanceId]);

  useEffect(() => {
    fetchSpecs();
  }, [fetchSpecs]);

  const handleSaveSpecs = async () => {
    if (!data?.classstructure_id) return;
    setSaving(true);
    setSaveSuccess(false);

    try {
      const specsPayload: SpecValueItem[] = data.specifications.map((s) => {
        const v = values[s.attribute_id] || {};
        return {
          attribute_id: s.attribute_id,
          aln_value: v.aln || null,
          num_value: v.num !== undefined && !isNaN(v.num) ? Number(v.num) : null,
          date_value: v.date ? new Date(v.date).toISOString() : null,
          unit_of_measure: v.uom || s.unit_of_measure || null,
        };
      });

      const res =
        targetType === 'asset'
          ? await api.updateAssetSpecifications(siteId, instanceId, {
              classstructure_id: data.classstructure_id,
              specs: specsPayload,
            })
          : await api.updateLocationSpecifications(siteId, instanceId, {
              classstructure_id: data.classstructure_id,
              specs: specsPayload,
            });

      setData(res);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      if (onSpecificationChanged) onSpecificationChanged();
    } catch (err: any) {
      alert(err.message || 'Failed to save specification values.');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenClassifyModal = async () => {
    setIsClassifyModalOpen(true);
    setLoadingClasses(true);
    try {
      const targetUse = targetType === 'asset' ? 'ASSET' : 'LOCATIONS';
      const list = await api.listClassifications({ use_with: targetUse });
      setAvailableClassifications(list);
    } catch (err) {
      console.error('Failed to list classifications:', err);
    } finally {
      setLoadingClasses(false);
    }
  };

  const handleSelectClassification = async (classstructureId: string | null) => {
    setIsClassifyModalOpen(false);
    setSaving(true);
    try {
      const res =
        targetType === 'asset'
          ? await api.updateAssetSpecifications(siteId, instanceId, {
              classstructure_id: classstructureId,
            })
          : await api.updateLocationSpecifications(siteId, instanceId, {
              classstructure_id: classstructureId,
            });
      setData(res);
      await fetchSpecs();
      if (onSpecificationChanged) onSpecificationChanged();
    } catch (err: any) {
      alert(err.message || 'Failed to change classification.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-28 items-center justify-center text-xs text-gray-400">
        <RefreshCw className="h-4 w-4 animate-spin mr-2" />
        Loading specifications...
      </div>
    );
  }

  const isClassified = Boolean(data?.classstructure_id);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Sliders className="h-3.5 w-3.5 text-sky-700" />
          <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700">
            Specifications
          </h4>
          <InfoTooltip text="Technical parameters and measurement specifications defined by the assigned Enterprise Classification." />
        </div>

        {isClassified ? (
          <button
            type="button"
            onClick={handleOpenClassifyModal}
            className="flex items-center gap-1 rounded border border-gray-200 px-2 py-0.5 text-[11px] font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
          >
            <Edit2 className="h-3 w-3 text-gray-400" />
            <span>Reclassify</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={handleOpenClassifyModal}
            className="flex items-center gap-1 rounded bg-sky-50 border border-sky-200/80 px-2 py-0.5 text-[11px] font-semibold text-sky-700 hover:bg-sky-100 transition-colors"
          >
            <Plus className="h-3 w-3" />
            <span>Classify {targetType === 'asset' ? 'Asset' : 'Location'}</span>
          </button>
        )}
      </div>

      {/* Active Classification Badge */}
      {isClassified ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-2.5 flex items-center justify-between text-xs">
          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-1 text-[11px] text-gray-500 font-mono">
              <Tag className="h-3 w-3 text-sky-600" />
              <span className="font-semibold text-gray-800">
                {data?.classification_path || data?.classstructure_id}
              </span>
            </div>
            <p className="text-[10px] text-gray-400">
              Structure ID: {data?.classstructure_id}
            </p>
          </div>

          <button
            type="button"
            onClick={() => handleSelectClassification(null)}
            title="Remove classification"
            className="rounded p-1 text-gray-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-gray-200 p-4 text-center text-xs text-gray-400">
          Not yet classified. Assign a classification to unlock standardized specification attributes and measurement values.
        </div>
      )}

      {/* Specifications Form Grid */}
      {isClassified && data?.specifications && data.specifications.length > 0 && (
        <div className="space-y-2.5 pt-1">
          <div className="space-y-2">
            {data.specifications.map((spec) => {
              const cur = values[spec.attribute_id] || {};
              return (
                <div
                  key={spec.attribute_id}
                  className="rounded-lg border border-gray-100 bg-slate-50/30 p-2.5 space-y-1 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-bold text-gray-800">
                        {spec.attribute_id}
                      </span>
                      {spec.description && spec.description !== spec.attribute_id && (
                        <span className="text-[11px] text-gray-500">
                          ({spec.description})
                        </span>
                      )}
                      {spec.mandatory && (
                        <span className="text-[10px] text-amber-700 font-bold">*</span>
                      )}
                    </div>

                    {spec.inherited_from && (
                      <span
                        className="rounded bg-indigo-50 text-indigo-700 border border-indigo-200/70 px-1 text-[9px]"
                        title={`Inherited from ${spec.inherited_from_path || spec.inherited_from}`}
                      >
                        Inherited
                      </span>
                    )}
                  </div>

                  {/* Input based on data type and domain values */}
                  <div className="flex items-center gap-2">
                    {spec.domain_values && spec.domain_values.length > 0 ? (
                      <select
                        value={cur.aln || ''}
                        onChange={(e) =>
                          setValues({
                            ...values,
                            [spec.attribute_id]: { ...cur, aln: e.target.value },
                          })
                        }
                        className="flex-1 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-800 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                      >
                        <option value="">(Select value)</option>
                        {spec.domain_values.map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                    ) : spec.data_type === 'NUMERIC' ? (
                      <div className="flex flex-1 items-center rounded-md border border-gray-200 bg-white overflow-hidden focus-within:border-sky-500 focus-within:ring-1 focus-within:ring-sky-500">
                        <input
                          type="number"
                          step="any"
                          placeholder="0.00"
                          value={cur.num !== undefined ? cur.num : ''}
                          onChange={(e) =>
                            setValues({
                              ...values,
                              [spec.attribute_id]: {
                                ...cur,
                                num: e.target.value === '' ? undefined : Number(e.target.value),
                              },
                            })
                          }
                          className="flex-1 px-2.5 py-1 font-mono text-xs focus:outline-none"
                        />
                        {spec.unit_of_measure && (
                          <span className="bg-slate-100 border-l border-gray-200 px-2 py-1 text-[10px] font-mono font-bold text-gray-600">
                            {spec.unit_of_measure}
                          </span>
                        )}
                      </div>
                    ) : spec.data_type === 'YORN' ? (
                      <select
                        value={cur.aln || ''}
                        onChange={(e) =>
                          setValues({
                            ...values,
                            [spec.attribute_id]: { ...cur, aln: e.target.value },
                          })
                        }
                        className="flex-1 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-800 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                      >
                        <option value="">(Not Set)</option>
                        <option value="YES">YES</option>
                        <option value="NO">NO</option>
                      </select>
                    ) : spec.data_type === 'DATE' ? (
                      <input
                        type="date"
                        value={cur.date ? cur.date.slice(0, 10) : ''}
                        onChange={(e) =>
                          setValues({
                            ...values,
                            [spec.attribute_id]: { ...cur, date: e.target.value },
                          })
                        }
                        className="flex-1 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-800 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                      />
                    ) : (
                      <input
                        type="text"
                        placeholder="Enter value..."
                        value={cur.aln || ''}
                        onChange={(e) =>
                          setValues({
                            ...values,
                            [spec.attribute_id]: { ...cur, aln: e.target.value },
                          })
                        }
                        className="flex-1 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-800 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Save Button */}
          <div className="flex items-center justify-between pt-2 border-t border-gray-100">
            {saveSuccess ? (
              <span className="flex items-center gap-1 text-emerald-700 text-xs font-medium">
                <Check className="h-3.5 w-3.5" />
                <span>Specifications updated</span>
              </span>
            ) : (
              <span className="text-[11px] text-gray-400">
                {data.specifications.length} attribute{data.specifications.length === 1 ? '' : 's'} defined
              </span>
            )}

            <button
              type="button"
              disabled={saving}
              onClick={handleSaveSpecs}
              className="flex items-center gap-1.5 rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-sky-700 disabled:opacity-50 transition-colors"
            >
              {saving && <RefreshCw className="h-3 w-3 animate-spin" />}
              <span>Save Values</span>
            </button>
          </div>
        </div>
      )}

      {/* Classify Selector Modal */}
      {isClassifyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-2xs p-4">
          <div className="w-full max-w-lg rounded-xl border border-gray-200 bg-white shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-gray-100 bg-slate-50/75 px-5 py-3.5">
              <div className="flex items-center gap-2">
                <FolderTree className="h-4 w-4 text-sky-700" />
                <h3 className="text-sm font-bold text-gray-900">
                  Select Classification for {targetType === 'asset' ? 'Asset' : 'Location'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsClassifyModalOpen(false)}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
              {loadingClasses ? (
                <div className="flex h-32 items-center justify-center text-xs text-gray-400">
                  <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                  Loading classifications...
                </div>
              ) : availableClassifications.length === 0 ? (
                <div className="p-4 text-center text-xs text-gray-400">
                  No compatible classifications found.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {availableClassifications.map((cls) => {
                    const isSelected = data?.classstructure_id === cls.classstructure_id;
                    return (
                      <div
                        key={cls.classstructure_id}
                        onClick={() => handleSelectClassification(cls.classstructure_id)}
                        className={`flex items-center justify-between rounded-lg border p-3 cursor-pointer transition-all ${
                          isSelected
                            ? 'border-sky-500 bg-sky-50/60'
                            : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-slate-50/60'
                        }`}
                      >
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <Tag className="h-3.5 w-3.5 text-sky-600" />
                            <span className="font-mono text-xs font-bold text-gray-900">
                              {cls.hierarchy_path}
                            </span>
                          </div>
                          <p className="text-xs text-gray-600">{cls.description}</p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-gray-600">
                            {cls.attributes_count || (cls.attributes ? cls.attributes.length : 0)} attrs
                          </span>
                          <ChevronRight className="h-4 w-4 text-gray-400" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end p-3 border-t border-gray-100 bg-slate-50/50">
              <button
                type="button"
                onClick={() => setIsClassifyModalOpen(false)}
                className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
