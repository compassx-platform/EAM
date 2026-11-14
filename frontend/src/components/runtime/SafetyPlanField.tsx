import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { AppliedSafety, SafetyPlan } from '../../types';

interface SafetyPlanFieldProps {
  value: string;
  siteId?: string;
  assetId?: string;
  locationId?: string;
  entityType?: string;
  entityId?: string | null;
  readOnly?: boolean;
  onChange: (value: string) => void;
}

export function SafetyPlanField({
  value,
  siteId,
  assetId,
  locationId,
  entityType,
  entityId,
  readOnly = false,
  onChange,
}: SafetyPlanFieldProps) {
  const [plans, setPlans] = useState<SafetyPlan[]>([]);
  const [applied, setApplied] = useState<AppliedSafety | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.listSafetyPlans(siteId || undefined).then(setPlans).catch(() => setPlans([]));
  }, [siteId]);

  useEffect(() => {
    if (!entityType || !entityId) return;
    api.getAppliedSafety(entityType, entityId).then(setApplied).catch(() => setApplied(null));
  }, [entityType, entityId]);

  const apply = async (planId: string) => {
    onChange(planId);
    if (!entityType || !entityId) return;
    setBusy(true);
    setError('');
    try {
      const next = await api.applySafetyPlan({
        entity_type: entityType,
        entity_id: entityId,
        safety_plan_id: planId || undefined,
        site_id: siteId || undefined,
        asset_id: assetId || undefined,
        location_id: locationId || undefined,
      });
      setApplied(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not apply the safety plan');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-2">
      <select
        value={value || applied?.safety_plan_id || ''}
        disabled={readOnly || busy}
        onChange={(e) => apply(e.target.value)}
        className="w-full rounded-md border border-gray-300 bg-white px-2 py-2 text-xs text-gray-900"
      >
        <option value="">Select a safety plan</option>
        {plans.map((plan) => (
          <option key={plan.safety_plan_id} value={plan.safety_plan_id}>
            {plan.safety_plan_id} — {plan.description}
          </option>
        ))}
      </select>
      {!entityId && <p className="text-[11px] text-gray-500">The hazards are copied onto the record after it is saved.</p>}
      {error && <p className="text-[11px] text-red-600">{error}</p>}
      {applied && applied.hazards.length > 0 && (
        <ul className="divide-y divide-gray-100 rounded-md border border-gray-200">
          {applied.hazards.map((hazard) => (
            <li key={hazard.id} className="px-2 py-1.5 text-xs">
              <span className="font-medium text-gray-900">{hazard.description}</span>
              {hazard.is_hazardous_material && <span className="ml-2 text-[10px] text-amber-700">Hazardous material</span>}
              {hazard.precautions.length > 0 && (
                <p className="text-gray-500">{hazard.precautions.map((row) => row.description).join(', ')}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
