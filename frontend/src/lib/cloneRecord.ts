import type { VisibilityCondition } from '../types';
import { getConditionRules } from './conditions';

export const RECORD_NOTICE_KEY = 'eam-record-notice';

const SKIPPED_FIELDS = new Set(['subprocess_child_id']);

/** Turn a saved custom-field value into the text the create form edits. */
export function cloneFieldValues(fields: Record<string, unknown> | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!fields) return out;
  for (const [key, value] of Object.entries(fields)) {
    if (!key || key.startsWith('_') || SKIPPED_FIELDS.has(key)) continue;
    out[key] = cloneFieldText(value);
  }
  return out;
}

/** A stored checkbox list may be a JSON array or a Python list string. */
function listLiteral(text: string): string | null {
  if (!text.startsWith('[') || !text.endsWith(']')) return null;
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return null;
    const primitives = parsed.every(
      (item) => item === null || item === undefined || typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean'
    );
    if (!primitives) return null;
    return parsed
      .filter((item) => item !== null && item !== undefined && String(item).trim() !== '')
      .map((item) => String(item))
      .join(',');
  } catch {
    const inner = text.slice(1, -1).trim();
    if (!inner) return '';
    const parts = inner.split(',').map((part) => part.trim().replace(/^['"]|['"]$/g, ''));
    if (parts.some((part) => part === '')) return null;
    return parts.join(',');
  }
}

function cloneFieldText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') {
    const low = value.trim().toLowerCase();
    if (low === 'true') return 'yes';
    if (low === 'false') return 'no';
    const listed = listLiteral(value.trim());
    return listed ?? value;
  }
  if (Array.isArray(value)) {
    const primitives = value.every(
      (item) => item === null || item === undefined || typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean'
    );
    if (primitives) {
      return value
        .filter((item) => item !== null && item !== undefined && String(item).trim() !== '')
        .map((item) => String(item))
        .join(',');
    }
    return JSON.stringify(value);
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * During clone review, sections gated only by workflow status stay visible.
 * Rules that depend on another field are kept.
 * Read-only and editable rules are left unchanged.
 */
export function withoutStatusVisibility(condition?: VisibilityCondition | null): VisibilityCondition | null {
  if (!condition) return null;
  const action = condition.action || 'show';
  if (action === 'readonly' || action === 'editable') return condition;

  const rules = getConditionRules(condition);
  const kept = rules.filter((rule) => rule.field !== '_workflow_status');
  if (kept.length === rules.length) return condition;
  if (kept.length === 0) return null;
  return {
    action: condition.action || 'show',
    matchType: condition.matchType,
    rules: kept,
  };
}
