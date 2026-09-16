import { ShieldCheck, Pencil, Minus } from 'lucide-react';
import type { ConditionDefinition } from '../../../types';

export function renderRulePreview(ruleNode: any): string {
  if (!ruleNode) return '';
  if ('group' in ruleNode && ruleNode.group) {
    const g = ruleNode.group;
    return `(${g.logic || 'AND'} group: ${(g.rules || []).length} clause${(g.rules || []).length === 1 ? '' : 's'})`;
  }
  const t = ruleNode.type;
  switch (t) {
    case 'attribute':
      return `${ruleNode.field || '?'} ${ruleNode.operator || 'eq'} ${ruleNode.value !== undefined ? JSON.stringify(ruleNode.value) : ''}`;
    case 'role':
      return `Actor role == "${ruleNode.role || '?'}"`;
    case 'field_not_empty':
      return `Field "${ruleNode.field || '?'}" is filled`;
    case 'date':
      return `Date "${ruleNode.field || '?'}" ${ruleNode.operator || 'ge'} ${ruleNode.value || 'now'}`;
    case 'related':
      return `Related ${ruleNode.relationship_field || '?'}${ruleNode.target_entity_type ? ` (${ruleNode.target_entity_type})` : ''}: status == "${ruleNode.required_status || ruleNode.target_field || '?'}"`;
    case 'expression':
      return `Expression: ${ruleNode.expression || '?'} ${ruleNode.operator || '>'} ${ruleNode.value ?? 0}`;
    default:
      return `${t || 'rule'}`;
  }
}

export interface ConditionCardProps {
  condition: ConditionDefinition;
  onEdit?: (condition: ConditionDefinition) => void;
  onRemove?: () => void;
  compact?: boolean;
}

export function ConditionCard({ condition, onEdit, onRemove, compact = false }: ConditionCardProps) {
  const rules = condition.definition?.rules ?? [];
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50/50 p-2.5 transition-colors hover:border-amber-300">
      <div className="flex items-start justify-between gap-1.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <ShieldCheck className="h-4 w-4 shrink-0 text-amber-600" />
            <span className="truncate text-xs font-bold text-gray-800">{condition.label}</span>
            <span className="rounded bg-white px-1 py-0.2 text-[9px] font-bold text-blue-700 ring-1 ring-blue-200">
              v{condition.current_version}
            </span>
            <span
              className={`rounded-full px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider ${
                condition.failure_policy === 'allow'
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              {condition.failure_policy === 'allow' ? 'Allow' : 'Block'}
            </span>
          </div>
          <span className="block truncate font-mono text-[10px] text-blue-700">{condition.id}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {onEdit && (
            <button
              type="button"
              onClick={() => onEdit(condition)}
              title="Edit in condition module"
              className="rounded p-1 text-gray-400 hover:bg-white hover:text-blue-700"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              title="Remove condition"
              className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {condition.description && (
        <p className="text-[11px] leading-snug text-gray-600 italic">{condition.description}</p>
      )}

      {!compact && (
        <div className="flex flex-col gap-1 rounded bg-white p-2 text-[11px] border border-gray-200/80">
          <div className="flex items-center justify-between text-[10px] font-semibold text-gray-500">
            <span>
              Logic: <strong className="text-gray-700">{condition.definition?.logic || 'AND'}</strong>
              {condition.definition?.negate ? ' (NOT)' : ''}
            </span>
            <span>
              {rules.length} clause{rules.length === 1 ? '' : 's'}
            </span>
          </div>
          {rules.length === 0 ? (
            <p className="text-[10px] text-gray-400">No rules defined in condition AST.</p>
          ) : (
            <div className="flex flex-col gap-1 mt-0.5 max-h-32 overflow-y-auto">
              {rules.map((r: any, idx: number) => (
                <div
                  key={idx}
                  className="flex items-center gap-1.5 rounded bg-gray-50 px-1.5 py-1 text-[10px] text-gray-700 font-mono"
                >
                  <span className="text-gray-400 shrink-0">#{idx + 1}</span>
                  <span className="truncate">{renderRulePreview(r)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
