import type {
  EntityFormItem,
  VisibilityCondition,
  ConditionRule,
  ConditionAction,
  ConditionOperator,
} from '../types';

/**
 * Reserved pseudo-field name used to reference the entity's current workflow
 * stage inside form condition rules. Stage -> form binding: rule.field can be
 * `_workflow_status` and rule.value a state from the published workflow (e.g.
 * "Approved") to hide/show/lock fields based on where the record is in its flow.
 */
export const WORKFLOW_STATUS_FIELD = '_workflow_status';

/**
 * Merges the entity's current workflow stage into condition values so that
 * rules referencing the `_workflow_status` pseudo-field can be evaluated.
 */
export function withWorkflowStatus(
  values: Record<string, unknown> = {},
  status?: string | null
): Record<string, unknown> {
  if (!status) return values;
  return { ...values, [WORKFLOW_STATUS_FIELD]: status };
}

/**
 * Checks if a value is considered empty (for conditional logic).
 */
export function isValueEmpty(val: unknown): boolean {
  if (val === undefined || val === null) return true;
  if (typeof val === 'boolean') return !val;
  if (typeof val === 'string') {
    const s = val.trim().toLowerCase();
    return s === '' || s === 'no';
  }
  if (Array.isArray(val)) return val.length === 0;
  return false;
}

/**
 * Normalizes a VisibilityCondition object into an array of ConditionRule items.
 */
export function getConditionRules(condition?: VisibilityCondition | null): ConditionRule[] {
  if (!condition) return [];
  if (condition.rules && condition.rules.length > 0) {
    return condition.rules.filter((r) => r && r.field && r.field.trim() !== '');
  }
  if (condition.field && condition.field.trim() !== '') {
    return [
      {
        field: condition.field.trim(),
        operator: condition.operator || 'equals',
        value: condition.value || '',
      },
    ];
  }
  return [];
}

/**
 * Evaluates a single rule clause against current form values.
 */
export function evaluateSingleRule(
  rule: ConditionRule,
  values: Record<string, unknown> = {}
): boolean {
  const targetField = rule.field.trim();
  let rawVal = values[targetField];
  if (rawVal === undefined) {
    const lowerKey = targetField.toLowerCase();
    for (const [k, v] of Object.entries(values)) {
      if (k.toLowerCase() === lowerKey) {
        rawVal = v;
        break;
      }
    }
  }

  const strVal = rawVal !== undefined && rawVal !== null ? String(rawVal).trim() : '';
  const condVal = (rule.value || '').trim();
  const operator = rule.operator || 'equals';

  switch (operator) {
    case 'equals':
      return strVal.toLowerCase() === condVal.toLowerCase();

    case 'not_equals':
      return strVal.toLowerCase() !== condVal.toLowerCase();

    case 'contains': {
      if (!condVal) return true;
      const parts = strVal.split(',').map((p) => p.trim().toLowerCase());
      return parts.includes(condVal.toLowerCase()) || strVal.toLowerCase().includes(condVal.toLowerCase());
    }

    case 'not_contains': {
      if (!condVal) return false;
      const parts = strVal.split(',').map((p) => p.trim().toLowerCase());
      return !parts.includes(condVal.toLowerCase()) && !strVal.toLowerCase().includes(condVal.toLowerCase());
    }

    case 'is_empty':
      return isValueEmpty(rawVal);

    case 'is_not_empty':
      return !isValueEmpty(rawVal);

    case 'greater_than': {
      const numVal = parseFloat(strVal);
      const numTarget = parseFloat(condVal);
      return !isNaN(numVal) && !isNaN(numTarget) && numVal > numTarget;
    }

    case 'less_than': {
      const numVal = parseFloat(strVal);
      const numTarget = parseFloat(condVal);
      return !isNaN(numVal) && !isNaN(numTarget) && numVal < numTarget;
    }

    default:
      return true;
  }
}

/**
 * Evaluates whether all/any condition rules match based on current form values.
 */
export function isConditionMatched(
  condition?: VisibilityCondition | null,
  values: Record<string, unknown> = {}
): boolean {
  const rules = getConditionRules(condition);
  if (rules.length === 0) return false;

  const matchType = condition?.matchType || 'all';

  if (matchType === 'any') {
    return rules.some((rule) => evaluateSingleRule(rule, values));
  }
  return rules.every((rule) => evaluateSingleRule(rule, values));
}

/**
 * Evaluates whether a condition passes for visibility (returns true if visible, false if hidden).
 */
export function evaluateVisibility(
  condition?: VisibilityCondition | null,
  values: Record<string, unknown> = {}
): boolean {
  const rules = getConditionRules(condition);
  if (rules.length === 0) return true;

  const action = condition?.action || 'show';
  if (action !== 'hide' && action !== 'show') {
    return true; // Not a visibility rule; always visible
  }

  const matched = isConditionMatched(condition, values);
  if (action === 'hide') {
    return !matched;
  }
  return matched;
}

/**
 * Evaluates whether a condition makes a field read-only (returns true if read-only, false if editable).
 */
export function evaluateReadOnly(
  condition?: VisibilityCondition | null,
  values: Record<string, unknown> = {}
): boolean {
  const rules = getConditionRules(condition);
  if (rules.length === 0) return false;

  const action = condition?.action;
  if (action !== 'readonly' && action !== 'editable') {
    return false; // Not a read-only rule
  }

  const matched = isConditionMatched(condition, values);
  if (action === 'readonly') {
    return matched;
  }
  if (action === 'editable') {
    return !matched;
  }
  return false;
}

/**
 * Backward-compatible evaluateCondition alias for visibility.
 */
export function evaluateCondition(
  condition?: VisibilityCondition | null,
  values: Record<string, unknown> = {}
): boolean {
  return evaluateVisibility(condition, values);
}

/**
 * Checks whether an EntityFormItem is currently visible, checking both its parent
 * group's condition (if grouped) and the item's own condition.
 */
export function isItemVisible(
  item: EntityFormItem,
  allItems: EntityFormItem[],
  values: Record<string, unknown> = {}
): boolean {
  // 1. Check parent group visibility condition
  const groupId = item.groupId ?? item.group_id;
  if (groupId) {
    const parentGroup = allItems.find(
      (it) => it.isGroup && (it.groupId === groupId || it.group_id === groupId || it.i === groupId)
    );
    if (parentGroup) {
      const groupCond = parentGroup.visibilityCondition ?? parentGroup.visibility_condition;
      if (!evaluateVisibility(groupCond, values)) {
        return false;
      }
    }
  }

  // 2. Check item's own visibility condition
  const itemCond = item.visibilityCondition ?? item.visibility_condition;
  return evaluateVisibility(itemCond, values);
}

/**
 * Checks whether an EntityFormItem is currently read-only, checking both its parent
 * group's condition (if grouped) and the item's own condition.
 */
export function isItemReadOnly(
  item: EntityFormItem,
  allItems: EntityFormItem[],
  values: Record<string, unknown> = {}
): boolean {
  // 1. Check parent group read-only condition
  const groupId = item.groupId ?? item.group_id;
  if (groupId) {
    const parentGroup = allItems.find(
      (it) => it.isGroup && (it.groupId === groupId || it.group_id === groupId || it.i === groupId)
    );
    if (parentGroup) {
      const groupCond = parentGroup.visibilityCondition ?? parentGroup.visibility_condition;
      if (evaluateReadOnly(groupCond, values)) {
        return true;
      }
    }
  }

  // 2. Check item's own read-only condition
  const itemCond = item.visibilityCondition ?? item.visibility_condition;
  return evaluateReadOnly(itemCond, values);
}

/**
 * Format a single rule summary.
 */
export function formatRuleSummary(rule: ConditionRule): string {
  const field = rule.field;
  const op = rule.operator;
  const val = rule.value;
  const fieldLabel = field === WORKFLOW_STATUS_FIELD ? 'Workflow stage' : `"${field}"`;

  switch (op) {
    case 'equals':
      return `${fieldLabel} = "${val}"`;
    case 'not_equals':
      return `${fieldLabel} ≠ "${val}"`;
    case 'contains':
      return `${fieldLabel} contains "${val}"`;
    case 'not_contains':
      return `${fieldLabel} not contains "${val}"`;
    case 'is_empty':
      return `${fieldLabel} is empty`;
    case 'is_not_empty':
      return `${fieldLabel} is filled`;
    case 'greater_than':
      return `${fieldLabel} > ${val}`;
    case 'less_than':
      return `${fieldLabel} < ${val}`;
    default:
      return `${fieldLabel} ${op} "${val}"`;
  }
}

/**
 * Friendly one-line description of a visibility or read-only condition.
 */
export function formatConditionSummary(condition?: VisibilityCondition | null): string {
  const rules = getConditionRules(condition);
  if (rules.length === 0) return 'Always active';

  const action = condition?.action || 'show';
  const actionLabel =
    action === 'hide'
      ? 'Hide when'
      : action === 'show'
      ? 'Show only when'
      : action === 'readonly'
      ? 'Read-only when'
      : 'Editable only when';

  const joiner = condition?.matchType === 'any' ? ' OR ' : ' AND ';
  const rulesText = rules.map(formatRuleSummary).join(joiner);
  return `${actionLabel} ${rulesText}`;
}

