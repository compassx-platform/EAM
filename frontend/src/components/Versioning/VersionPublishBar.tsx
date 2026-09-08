import React, { useState } from 'react';
import { WorkflowDefinition } from '../../types';
import { api } from '../../api/client';
import { Button } from '../../design-system/components/Button';
import { Badge } from '../../design-system/components/Badge';
import {
  CheckCircle,
  AlertTriangle,
  XCircle,
  UploadCloud,
  Layers,
  Sparkles,
  GitBranch,
} from 'lucide-react';

interface VersionPublishBarProps {
  workflow: WorkflowDefinition;
  onWorkflowUpdated: (wf: WorkflowDefinition) => void;
  allVersions: WorkflowDefinition[];
  onSelectVersion: (id: string) => void;
  onSaveDraft: () => void;
}

export const VersionPublishBar: React.FC<VersionPublishBarProps> = ({
  workflow,
  onWorkflowUpdated,
  allVersions,
  onSelectVersion,
  onSaveDraft,
}) => {
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    errors: string[];
    warnings: string[];
  } | null>(null);
  const [publishing, setPublishing] = useState(false);

  const handleValidate = async () => {
    setValidating(true);
    setValidationResult(null);
    try {
      const res = await api.validateWorkflow(workflow.id);
      setValidationResult(res);
    } catch (err: any) {
      alert(`Validation failed: ${err.message}`);
    } finally {
      setValidating(false);
    }
  };

  const handlePublish = async () => {
    if (
      !confirm(
        `Publish workflow version '${workflow.version_label}'? Once published, this version definition becomes immutable (Section 3.4).`
      )
    ) {
      return;
    }

    setPublishing(true);
    try {
      const res = await api.publishWorkflow(workflow.id);
      onWorkflowUpdated(res.workflow);
      alert(`Workflow version '${workflow.version_label}' successfully published!`);
    } catch (err: any) {
      alert(`Publish error: ${err.message}`);
    } finally {
      setPublishing(false);
    }
  };

  const isDraft = workflow.status === 'draft';
  const isPublished = workflow.status === 'published';

  return (
    <div className="bg-[var(--cx-color-surface)] border border-[var(--cx-color-border)] rounded-[var(--cx-radius-lg)] p-4 shadow-xs space-y-3">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Version info and status */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-[var(--cx-color-text)]">Version:</span>
            <select
              className="cx-select text-xs font-mono font-bold w-52"
              value={workflow.id}
              onChange={(e) => onSelectVersion(e.target.value)}
            >
              {allVersions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.version_label} [{v.status}]
                </option>
              ))}
            </select>
          </div>

          <Badge
            variant={
              isPublished
                ? 'success'
                : isDraft
                ? 'warning'
                : 'default'
            }
          >
            {workflow.status.toUpperCase()}
          </Badge>

          <span className="text-xs text-[var(--cx-color-text-muted)]">
            {workflow.published_at
              ? `Published: ${new Date(workflow.published_at).toLocaleDateString()}`
              : `Created: ${new Date(workflow.created_at).toLocaleDateString()}`}
          </span>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <Button
            size="sm"
            variant="secondary"
            onClick={onSaveDraft}
            title="Save draft definition"
          >
            Save Draft
          </Button>

          <Button
            size="sm"
            variant="secondary"
            onClick={handleValidate}
            loading={validating}
            icon={<Sparkles className="w-3.5 h-3.5 text-blue-500" />}
          >
            Validate Graph Rules (§6)
          </Button>

          {isDraft && (
            <Button
              size="sm"
              variant="primary"
              onClick={handlePublish}
              loading={publishing}
              icon={<UploadCloud className="w-3.5 h-3.5" />}
            >
              Publish Immutable Version
            </Button>
          )}
        </div>
      </div>

      {/* Inline Validation feedback */}
      {validationResult && (
        <div
          className={`p-3.5 rounded-md text-xs border ${
            validationResult.valid
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
              : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
          }`}
        >
          <div className="flex items-center gap-2 font-bold mb-1">
            {validationResult.valid ? (
              <>
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                <span>Workflow Validation Passed (Ready to Publish)</span>
              </>
            ) : (
              <>
                <XCircle className="w-4 h-4 text-rose-600" />
                <span>Validation Errors Detected ({validationResult.errors.length})</span>
              </>
            )}
          </div>

          {validationResult.errors.length > 0 && (
            <ul className="list-disc list-inside space-y-0.5 mt-1 text-[11px]">
              {validationResult.errors.map((err, idx) => (
                <li key={idx}>{err}</li>
              ))}
            </ul>
          )}

          {validationResult.warnings.length > 0 && (
            <div className="mt-2 pt-1 border-t border-[var(--cx-color-border)] text-amber-800 dark:text-amber-300">
              <div className="font-semibold flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Warnings ({validationResult.warnings.length}):</span>
              </div>
              <ul className="list-disc list-inside space-y-0.5 mt-0.5 text-[11px]">
                {validationResult.warnings.map((w, idx) => (
                  <li key={idx}>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
