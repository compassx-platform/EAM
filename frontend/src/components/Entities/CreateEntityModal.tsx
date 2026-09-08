import React, { useState, useEffect } from 'react';
import { Modal } from '../../design-system/components/Modal';
import { Button } from '../../design-system/components/Button';
import { EntityField, EntityInstance } from '../../types';
import { api } from '../../api/client';
import { Plus, AlertCircle, Link as LinkIcon } from 'lucide-react';

interface CreateEntityModalProps {
  isOpen: boolean;
  onClose: () => void;
  entityType: string;
  onCreated: (newEntity: any) => void;
}

export const CreateEntityModal: React.FC<CreateEntityModalProps> = ({
  isOpen,
  onClose,
  entityType,
  onCreated,
}) => {
  const [fields, setFields] = useState<EntityField[]>([]);
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [referenceEntities, setReferenceEntities] = useState<Record<string, EntityInstance[]>>({});
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setFormValues({});
      setComment('');
      
      api.listFields(entityType).then((fList) => {
        setFields(fList);
        // Initialize default empty values
        const defaults: Record<string, any> = {};
        fList.forEach((f) => {
          if (f.field_type === 'select' && f.select_options && f.select_options.length > 0) {
            defaults[f.field_name] = f.select_options[0];
          } else {
            defaults[f.field_name] = '';
          }
        });
        setFormValues(defaults);

        // Preload any reference entities (e.g. permits for work order linked_permit_id)
        fList
          .filter((f) => f.field_type === 'entity_reference' && f.reference_entity_type)
          .forEach((refField) => {
            if (refField.reference_entity_type) {
              api.listEntities(refField.reference_entity_type).then((res) => {
                setReferenceEntities((prev) => ({
                  ...prev,
                  [refField.reference_entity_type!]: res.items,
                }));
              });
            }
          });
      });
    }
  }, [isOpen, entityType]);

  const handleChange = (fieldName: string, value: any) => {
    setFormValues((prev) => ({ ...prev, [fieldName]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await api.createEntity(
        entityType,
        formValues,
        comment ? { comment } : undefined
      );
      onCreated(res.entity);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create entity');
    } finally {
      setLoading(false);
    }
  };

  const displayName = entityType === 'workorder' ? 'Work Order' : entityType === 'permit' ? 'Permit to Work' : entityType;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Create New ${displayName}`}
      description={`Fields are dynamically governed by the ${entityType} field schema registry.`}
      maxWidth="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit} loading={loading} icon={<Plus className="w-4 h-4" />}>
            Create {displayName}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs rounded-md">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {fields.map((f) => {
            const isFullWidth = f.field_name === 'title' || f.field_name === 'description' || f.field_name === 'safety_precautions';
            return (
              <div key={f.field_name} className={isFullWidth ? 'md:col-span-2' : ''}>
                <label className="block text-xs font-semibold text-[var(--cx-color-text)] mb-1">
                  {f.field_name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                  {f.required && <span className="text-red-500 ml-1">*</span>}
                  <span className="text-[10px] text-[var(--cx-color-text-subtle)] font-normal ml-1">
                    ({f.field_type})
                  </span>
                </label>

                {f.field_type === 'select' ? (
                  <select
                    className="cx-select"
                    value={formValues[f.field_name] || ''}
                    onChange={(e) => handleChange(f.field_name, e.target.value)}
                    required={f.required}
                  >
                    <option value="">Select option...</option>
                    {(f.select_options || []).map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : f.field_type === 'entity_reference' ? (
                  <div className="space-y-1">
                    <select
                      className="cx-select"
                      value={formValues[f.field_name] || ''}
                      onChange={(e) => handleChange(f.field_name, e.target.value)}
                    >
                      <option value="">No linked {f.reference_entity_type} (Optional)</option>
                      {(referenceEntities[f.reference_entity_type || ''] || []).map((ref) => (
                        <option key={ref.id} value={ref.id}>
                          {ref.custom_fields?.title || ref.id.substring(0, 8)} [{ref.status}]
                        </option>
                      ))}
                    </select>
                    <div className="text-[10px] text-[var(--cx-color-text-muted)] flex items-center gap-1">
                      <LinkIcon className="w-3 h-3 text-[var(--cx-color-brand-primary)]" />
                      <span>Links to a {f.reference_entity_type} instance for cross-entity gating</span>
                    </div>
                  </div>
                ) : f.field_type === 'number' ? (
                  <input
                    type="number"
                    className="cx-input"
                    value={formValues[f.field_name] || ''}
                    onChange={(e) => handleChange(f.field_name, e.target.value)}
                    placeholder="e.g. 5000"
                    required={f.required}
                  />
                ) : f.field_type === 'date' ? (
                  <input
                    type="datetime-local"
                    className="cx-input"
                    value={formValues[f.field_name] ? formValues[f.field_name].substring(0, 16) : ''}
                    onChange={(e) => handleChange(f.field_name, e.target.value ? new Date(e.target.value).toISOString() : '')}
                    required={f.required}
                  />
                ) : f.field_name === 'description' || f.field_name === 'safety_precautions' ? (
                  <textarea
                    className="cx-input resize-y min-h-[60px]"
                    value={formValues[f.field_name] || ''}
                    onChange={(e) => handleChange(f.field_name, e.target.value)}
                    placeholder={`Enter ${f.field_name.replace(/_/g, ' ')}...`}
                    required={f.required}
                  />
                ) : (
                  <input
                    type="text"
                    className="cx-input"
                    value={formValues[f.field_name] || ''}
                    onChange={(e) => handleChange(f.field_name, e.target.value)}
                    placeholder={`Enter ${f.field_name.replace(/_/g, ' ')}...`}
                    required={f.required}
                  />
                )}
              </div>
            );
          })}

          <div className="md:col-span-2 pt-2 border-t border-[var(--cx-color-border)]">
            <label className="block text-xs font-semibold text-[var(--cx-color-text)] mb-1">
              Creation Note / Event Payload Comment
            </label>
            <input
              type="text"
              className="cx-input"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="e.g. Initial creation of maintenance request"
            />
          </div>
        </div>
      </form>
    </Modal>
  );
};
