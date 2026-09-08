import React, { useState, useEffect } from 'react';
import { EntityField } from '../../types';
import { api } from '../../api/client';
import { Button } from '../../design-system/components/Button';
import { Badge } from '../../design-system/components/Badge';
import { Modal } from '../../design-system/components/Modal';
import { Plus, Trash2, Sliders, Link as LinkIcon } from 'lucide-react';

interface FieldManagerProps {
  entityType: string;
  onFieldsChanged?: () => void;
}

export const FieldManager: React.FC<FieldManagerProps> = ({
  entityType,
  onFieldsChanged,
}) => {
  const [fields, setFields] = useState<EntityField[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form state
  const [fieldName, setFieldName] = useState('');
  const [fieldType, setFieldType] = useState<
    'text' | 'number' | 'date' | 'select' | 'entity_reference'
  >('text');
  const [required, setRequired] = useState(false);
  const [selectOptionsStr, setSelectOptionsStr] = useState('');
  const [referenceEntityType, setReferenceEntityType] = useState('permit');
  const [saving, setSaving] = useState(false);

  const loadFields = async () => {
    setLoading(true);
    try {
      const res = await api.listFields(entityType);
      setFields(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFields();
  }, [entityType]);

  const handleSaveField = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fieldName.trim()) return;

    setSaving(true);
    try {
      const options =
        fieldType === 'select'
          ? selectOptionsStr
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined;

      await api.saveField({
        entity_type: entityType,
        field_name: fieldName.trim().toLowerCase().replace(/\s+/g, '_'),
        field_type: fieldType,
        required,
        select_options: options,
        reference_entity_type: fieldType === 'entity_reference' ? referenceEntityType : undefined,
      });

      setIsModalOpen(false);
      setFieldName('');
      setSelectOptionsStr('');
      setRequired(false);
      loadFields();
      if (onFieldsChanged) onFieldsChanged();
    } catch (err: any) {
      alert(`Error saving field: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteField = async (name: string) => {
    if (confirm(`Delete custom field '${name}' from ${entityType} schema registry?`)) {
      try {
        await api.deleteField(entityType, name);
        loadFields();
        if (onFieldsChanged) onFieldsChanged();
      } catch (err: any) {
        alert(`Error deleting field: ${err.message}`);
      }
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-[var(--cx-color-text)] flex items-center gap-2">
            <Sliders className="w-4 h-4 text-[var(--cx-color-brand-primary)]" />
            <span>Field Schema Registry ({entityType})</span>
          </h3>
          <p className="text-xs text-[var(--cx-color-text-muted)]">
            Governs custom_fields attributes validated at write time and exposed in condition builders (Section 3.2).
          </p>
        </div>

        <Button
          size="sm"
          variant="primary"
          onClick={() => setIsModalOpen(true)}
          icon={<Plus className="w-3.5 h-3.5" />}
        >
          Register Custom Field
        </Button>
      </div>

      <div className="bg-[var(--cx-color-surface)] border border-[var(--cx-color-border)] rounded-[var(--cx-radius-lg)] overflow-hidden shadow-xs">
        <table className="cx-table">
          <thead>
            <tr>
              <th>Field Name</th>
              <th>Data Type</th>
              <th>Required</th>
              <th>Options / Target Reference</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {fields.map((f) => (
              <tr key={f.field_name}>
                <td className="font-mono font-semibold text-xs text-[var(--cx-color-text)]">
                  {f.field_name}
                </td>
                <td>
                  <Badge variant="primary" size="sm">
                    {f.field_type}
                  </Badge>
                </td>
                <td>
                  <Badge variant={f.required ? 'warning' : 'default'} size="sm">
                    {f.required ? 'Required' : 'Optional'}
                  </Badge>
                </td>
                <td className="text-xs">
                  {f.field_type === 'select' && f.select_options && (
                    <div className="flex flex-wrap gap-1">
                      {f.select_options.map((opt) => (
                        <span
                          key={opt}
                          className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-[10px]"
                        >
                          {opt}
                        </span>
                      ))}
                    </div>
                  )}
                  {f.field_type === 'entity_reference' && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-mono text-[var(--cx-color-brand-primary)]">
                      <LinkIcon className="w-3 h-3" />
                      &rarr; {f.reference_entity_type}
                    </span>
                  )}
                  {f.field_type !== 'select' && f.field_type !== 'entity_reference' && '-'}
                </td>
                <td>
                  <button
                    onClick={() => handleDeleteField(f.field_name)}
                    className="p-1 text-gray-400 hover:text-red-500 rounded transition-colors"
                    title="Delete field"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={`Register Custom Field for ${entityType}`}
        description="Custom fields are stored in JSONB and validated by the backend application layer."
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSaveField} loading={saving}>
              Register Field
            </Button>
          </>
        }
      >
        <form onSubmit={handleSaveField} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[var(--cx-color-text)] mb-1">
              Field Name (snake_case)
            </label>
            <input
              type="text"
              className="cx-input"
              value={fieldName}
              onChange={(e) => setFieldName(e.target.value)}
              placeholder="e.g. pressure_psi, hazardous_gas_type"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[var(--cx-color-text)] mb-1">
                Data Type
              </label>
              <select
                className="cx-select"
                value={fieldType}
                onChange={(e) => setFieldType(e.target.value as any)}
              >
                <option value="text">text (string)</option>
                <option value="number">number (float/int)</option>
                <option value="date">date (ISO string)</option>
                <option value="select">select (enum list)</option>
                <option value="entity_reference">entity_reference (cross-entity link)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--cx-color-text)] mb-1">
                Mandatory
              </label>
              <label className="flex items-center gap-2 mt-2 text-xs font-medium text-[var(--cx-color-text)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={required}
                  onChange={(e) => setRequired(e.target.checked)}
                  className="rounded text-[var(--cx-color-brand-primary)]"
                />
                <span>Required on creation</span>
              </label>
            </div>
          </div>

          {fieldType === 'select' && (
            <div>
              <label className="block text-xs font-semibold text-[var(--cx-color-text)] mb-1">
                Select Options (comma separated)
              </label>
              <input
                type="text"
                className="cx-input"
                value={selectOptionsStr}
                onChange={(e) => setSelectOptionsStr(e.target.value)}
                placeholder="Low, Medium, High, Critical"
                required
              />
            </div>
          )}

          {fieldType === 'entity_reference' && (
            <div>
              <label className="block text-xs font-semibold text-[var(--cx-color-text)] mb-1">
                Target Reference Entity Type
              </label>
              <select
                className="cx-select"
                value={referenceEntityType}
                onChange={(e) => setReferenceEntityType(e.target.value)}
              >
                <option value="permit">permit</option>
                <option value="workorder">workorder</option>
              </select>
            </div>
          )}
        </form>
      </Modal>
    </div>
  );
};
