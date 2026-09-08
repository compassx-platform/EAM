import React, { useState, useEffect } from 'react';
import { GateTypeCatalogItem, GateInstance, EntityField } from '../../types';
import { api } from '../../api/client';
import { Button } from '../../design-system/components/Button';
import { Shield, Info, CheckCircle2, AlertTriangle } from 'lucide-react';

interface ConditionBuilderProps {
  entityType: string;
  initialGate?: Partial<GateInstance>;
  onSave: (gate: Partial<GateInstance>) => void;
  onCancel?: () => void;
}

export const ConditionBuilder: React.FC<ConditionBuilderProps> = ({
  entityType,
  initialGate,
  onSave,
  onCancel,
}) => {
  const [catalog, setCatalog] = useState<GateTypeCatalogItem[]>([]);
  const [fields, setFields] = useState<EntityField[]>([]);
  const [selectedType, setSelectedType] = useState<string>(initialGate?.gate_type || 'role_check');
  const [label, setLabel] = useState<string>(initialGate?.label || '');
  const [params, setParams] = useState<Record<string, any>>(initialGate?.params || {});
  const [failurePolicy, setFailurePolicy] = useState<'block' | 'allow'>(
    initialGate?.failure_policy || 'block'
  );

  useEffect(() => {
    Promise.all([api.getGateTypes(), api.listFields(entityType)]).then(([catRes, fRes]) => {
      setCatalog(catRes);
      setFields(fRes);
      if (!initialGate?.gate_type && catRes.length > 0) {
        setSelectedType(catRes[0].gate_type);
      }
    });
  }, [entityType]);

  const activeCatalogItem = catalog.find((c) => c.gate_type === selectedType);

  const handleParamChange = (paramName: string, val: any) => {
    setParams((prev) => ({ ...prev, [paramName]: val }));
  };

  // Generate plain English preview
  const getPlainEnglishPreview = () => {
    if (selectedType === 'role_check') {
      return `Actor executing the transition must possess the '${params.role || '...'}' role.`;
    }
    if (selectedType === 'numeric_threshold') {
      return `Entity custom field '${params.field || '...'}' must be ${params.operator || '≤'} ${params.value ?? '...'}.`;
    }
    if (selectedType === 'field_not_empty') {
      return `Entity custom field '${params.field || '...'}' must not be empty or blank.`;
    }
    if (selectedType === 'date_check') {
      return `Date field '${params.field || '...'}' must be ${params.operator || '<'} ${params.value || 'now'}.`;
    }
    if (selectedType === 'related_entity_status_check') {
      return `Follow reference field '${params.relationship_field || '...'}' to '${params.target_entity_type || '...'}' and verify status is '${params.required_status || '...'}' (if linked).`;
    }
    return 'Custom gate logic.';
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const generatedLabel = label || getPlainEnglishPreview();
    onSave({
      id: initialGate?.id,
      entity_type: entityType,
      gate_type: selectedType,
      label: generatedLabel,
      params,
      failure_policy: failurePolicy,
    });
  };

  return (
    <form onSubmit={handleSave} className="space-y-4">
      {/* Gate Type Selector */}
      <div>
        <label className="block text-xs font-semibold text-[var(--cx-color-text)] mb-1">
          1. Select Gate Type (Closed Deterministic Engine Layer)
        </label>
        <select
          className="cx-select"
          value={selectedType}
          onChange={(e) => {
            setSelectedType(e.target.value);
            setParams({});
          }}
        >
          {catalog.map((cat) => (
            <option key={cat.gate_type} value={cat.gate_type}>
              {cat.name} ({cat.gate_type})
            </option>
          ))}
        </select>
        {activeCatalogItem && (
          <p className="text-[11px] text-[var(--cx-color-text-muted)] mt-1">
            {activeCatalogItem.description}
          </p>
        )}
      </div>

      {/* Dynamic Param Inputs */}
      <div className="bg-[var(--cx-color-surface-subtle)] border border-[var(--cx-color-border)] rounded-[var(--cx-radius-md)] p-3.5 space-y-3">
        <div className="text-xs font-bold text-[var(--cx-color-text)] uppercase tracking-wider">
          2. Configure Gate Parameters
        </div>

        {selectedType === 'role_check' && (
          <div>
            <label className="block text-xs font-semibold text-[var(--cx-color-text)] mb-1">
              Required Role
            </label>
            <select
              className="cx-select"
              value={params.role || ''}
              onChange={(e) => handleParamChange('role', e.target.value)}
              required
            >
              <option value="">Select required role...</option>
              <option value="Admin">Admin</option>
              <option value="Supervisor">Supervisor</option>
              <option value="Safety Officer">Safety Officer</option>
              <option value="Technician">Technician</option>
              <option value="Manager">Manager</option>
            </select>
          </div>
        )}

        {selectedType === 'numeric_threshold' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[var(--cx-color-text)] mb-1">
                Field
              </label>
              <select
                className="cx-select"
                value={params.field || ''}
                onChange={(e) => handleParamChange('field', e.target.value)}
                required
              >
                <option value="">Select field...</option>
                {fields.map((f) => (
                  <option key={f.field_name} value={f.field_name}>
                    {f.field_name} ({f.field_type})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--cx-color-text)] mb-1">
                Operator
              </label>
              <select
                className="cx-select"
                value={params.operator || '<='}
                onChange={(e) => handleParamChange('operator', e.target.value)}
              >
                <option value="<=">&le; (Less than or equal)</option>
                <option value="<">&lt; (Less than)</option>
                <option value=">=">&ge; (Greater than or equal)</option>
                <option value=">">&gt; (Greater than)</option>
                <option value="=">= (Equals)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--cx-color-text)] mb-1">
                Threshold Value
              </label>
              <input
                type="number"
                className="cx-input"
                value={params.value ?? ''}
                onChange={(e) => handleParamChange('value', Number(e.target.value))}
                placeholder="e.g. 15000"
                required
              />
            </div>
          </div>
        )}

        {selectedType === 'field_not_empty' && (
          <div>
            <label className="block text-xs font-semibold text-[var(--cx-color-text)] mb-1">
              Field to Mandate
            </label>
            <select
              className="cx-select"
              value={params.field || ''}
              onChange={(e) => handleParamChange('field', e.target.value)}
              required
            >
              <option value="">Select field...</option>
              {fields.map((f) => (
                <option key={f.field_name} value={f.field_name}>
                  {f.field_name} ({f.field_type})
                </option>
              ))}
            </select>
          </div>
        )}

        {selectedType === 'date_check' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[var(--cx-color-text)] mb-1">
                Date Field
              </label>
              <select
                className="cx-select"
                value={params.field || ''}
                onChange={(e) => handleParamChange('field', e.target.value)}
                required
              >
                <option value="">Select date field...</option>
                {fields.map((f) => (
                  <option key={f.field_name} value={f.field_name}>
                    {f.field_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--cx-color-text)] mb-1">
                Operator
              </label>
              <select
                className="cx-select"
                value={params.operator || '<'}
                onChange={(e) => handleParamChange('operator', e.target.value)}
              >
                <option value="<">&lt; (Before)</option>
                <option value="<=">&le; (Before or on)</option>
                <option value=">">&gt; (After)</option>
                <option value=">=">&ge; (After or on)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--cx-color-text)] mb-1">
                Compare Against
              </label>
              <input
                type="text"
                className="cx-input"
                value={params.value || 'now'}
                onChange={(e) => handleParamChange('value', e.target.value)}
                placeholder="now or ISO date"
                required
              />
            </div>
          </div>
        )}

        {selectedType === 'related_entity_status_check' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[var(--cx-color-text)] mb-1">
                Relationship Field
              </label>
              <select
                className="cx-select"
                value={params.relationship_field || ''}
                onChange={(e) => handleParamChange('relationship_field', e.target.value)}
                required
              >
                <option value="">Select field...</option>
                {fields
                  .filter((f) => f.field_type === 'entity_reference')
                  .map((f) => (
                    <option key={f.field_name} value={f.field_name}>
                      {f.field_name} (&rarr; {f.reference_entity_type})
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--cx-color-text)] mb-1">
                Target Entity Type
              </label>
              <select
                className="cx-select"
                value={params.target_entity_type || 'permit'}
                onChange={(e) => handleParamChange('target_entity_type', e.target.value)}
              >
                <option value="permit">permit</option>
                <option value="workorder">workorder</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--cx-color-text)] mb-1">
                Required Target Status
              </label>
              <input
                type="text"
                className="cx-input"
                value={params.required_status || 'Active'}
                onChange={(e) => handleParamChange('required_status', e.target.value)}
                placeholder="e.g. Active"
                required
              />
            </div>
          </div>
        )}
      </div>

      {/* Label and Failure Policy */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-[var(--cx-color-text)] mb-1">
            Display Label (Human readable)
          </label>
          <input
            type="text"
            className="cx-input"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Linked Permit must be Active"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-[var(--cx-color-text)] mb-1">
            Failure Policy
          </label>
          <select
            className="cx-select"
            value={failurePolicy}
            onChange={(e) => setFailurePolicy(e.target.value as 'block' | 'allow')}
          >
            <option value="block">Fail-Closed: Block transition (Strict)</option>
            <option value="allow">Fail-Open: Allow transition (Advisory notice)</option>
          </select>
        </div>
      </div>

      {/* Live Plain English Preview */}
      <div className="p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-md">
        <div className="text-[10px] font-bold text-blue-700 dark:text-blue-300 uppercase flex items-center gap-1">
          <Info className="w-3.5 h-3.5" />
          <span>Live Plain-English Enforcement Rule</span>
        </div>
        <div className="text-xs font-medium text-[var(--cx-color-text)] mt-1">
          {getPlainEnglishPreview()}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--cx-color-border)]">
        {onCancel && (
          <Button variant="secondary" onClick={onCancel} type="button">
            Cancel
          </Button>
        )}
        <Button variant="primary" type="submit">
          Save Gate Configuration
        </Button>
      </div>
    </form>
  );
};
