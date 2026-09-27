import type {
  EntityFormItem,
  FormTab,
  VisibilityCondition,
  ConditionRule,
  ConditionAction,
  ConditionOperator,
  ConditionDefinition,
  ConditionGroup,
  ConditionAtom,
  ConditionRuleNode,
} from '../types';

/**
 * Reserved pseudo-field name used to reference the entity's current workflow
 * stage inside form condition rules. Stage -> form binding: rule.field can be
 * `_workflow_status` and rule.value a state from the published workflow (e.g.
 * "Approved") to hide/show/lock fields based on where the record is in its flow.
 */
export const WORKFLOW_STATUS_FIELD = '_workflow_status';

/**
 * Merges the entity's current workflow stage and status into condition values so that
 * rules referencing the `_workflow_status` pseudo-field, `workflow_stage`, or `status` can be evaluated.
 */
export function withWorkflowStatus(
  values: Record<string, unknown> = {},
  status?: string | null,
  stage?: string | null
): Record<string, unknown> {
  const effectiveStage = stage || status;
  if (!effectiveStage && !status) return values;
  const result: Record<string, unknown> = { ...values };
  if (effectiveStage) {
    result[WORKFLOW_STATUS_FIELD] = effectiveStage;
    result['_workflow_stage'] = effectiveStage;
    result['workflow_stage'] = effectiveStage;
    result['stage'] = effectiveStage;
  }
  if (status) {
    result['status'] = status;
    if (!result[WORKFLOW_STATUS_FIELD]) {
      result[WORKFLOW_STATUS_FIELD] = status;
    }
  }
  return result;
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
 * Helper to normalize a list or dictionary of ConditionDefinitions into a map.
 */
export function toConditionMap(
  defs?: ConditionDefinition[] | Record<string, ConditionDefinition> | null
): Record<string, ConditionDefinition> {
  if (!defs) return {};
  if (Array.isArray(defs)) {
    const map: Record<string, ConditionDefinition> = {};
    defs.forEach((d) => {
      if (d && d.id) map[d.id] = d;
    });
    return map;
  }
  return defs;
}

// -----------------------------------------------------------------------------
// Centralized AST Evaluator (Maximo Conditional Expression analogue)
// -----------------------------------------------------------------------------

function getFieldValue(values: Record<string, unknown>, fieldName: string): unknown {
  const target = fieldName.trim();
  if (values[target] !== undefined) return values[target];
  const lower = target.toLowerCase();
  for (const [k, v] of Object.entries(values)) {
    if (k.toLowerCase() === lower) return v;
  }
  return undefined;
}

/**
 * Evaluates a single ConditionAtom against form/entity values.
 */
export function evaluateConditionAtom(
  atom: ConditionAtom,
  values: Record<string, unknown> = {},
  userContext?: { role?: string; roles?: string[] }
): boolean {
  switch (atom.type) {
    case 'attribute': {
      const rawVal = getFieldValue(values, atom.field);
      const strVal = rawVal !== undefined && rawVal !== null ? String(rawVal).trim() : '';
      const targetVal = atom.value !== undefined && atom.value !== null ? String(atom.value).trim() : '';
      const caseSensitive = Boolean(atom.case_sensitive);
      const op = atom.operator || 'eq';

      if (op === 'is_empty') return isValueEmpty(rawVal);
      if (op === 'is_not_empty') return !isValueEmpty(rawVal);

      const left = caseSensitive ? strVal : strVal.toLowerCase();
      const right = caseSensitive ? targetVal : targetVal.toLowerCase();

      switch (op) {
        case 'eq':
        case 'equals': {
          const bLeft = left === 'true' || left === 'yes' || left === '1' ? true : (left === 'false' || left === 'no' || left === '0' ? false : null);
          const bRight = right === 'true' || right === 'yes' || right === '1' ? true : (right === 'false' || right === 'no' || right === '0' ? false : null);
          if (bLeft !== null && bRight !== null) {
            return bLeft === bRight;
          }
          return left === right;
        }

        case 'ne':
        case 'not_equals': {
          const bLeft = left === 'true' || left === 'yes' || left === '1' ? true : (left === 'false' || left === 'no' || left === '0' ? false : null);
          const bRight = right === 'true' || right === 'yes' || right === '1' ? true : (right === 'false' || right === 'no' || right === '0' ? false : null);
          if (bLeft !== null && bRight !== null) {
            return bLeft !== bRight;
          }
          return left !== right;
        }

        case 'contains':
          if (!right) return true;
          return left.includes(right);

        case 'not_contains':
          if (!right) return false;
          return !left.includes(right);

        case 'starts_with':
          return left.startsWith(right);

        case 'ends_with':
          return left.endsWith(right);

        case 'in': {
          const parts = targetVal.split(',').map((p) => (caseSensitive ? p.trim() : p.trim().toLowerCase()));
          return parts.includes(left);
        }

        case 'not_in': {
          const parts = targetVal.split(',').map((p) => (caseSensitive ? p.trim() : p.trim().toLowerCase()));
          return !parts.includes(left);
        }

        case 'lt':
        case 'less_than': {
          const numL = parseFloat(strVal);
          const numR = parseFloat(targetVal);
          return !isNaN(numL) && !isNaN(numR) && numL < numR;
        }

        case 'le': {
          const numL = parseFloat(strVal);
          const numR = parseFloat(targetVal);
          return !isNaN(numL) && !isNaN(numR) && numL <= numR;
        }

        case 'gt':
        case 'greater_than': {
          const numL = parseFloat(strVal);
          const numR = parseFloat(targetVal);
          return !isNaN(numL) && !isNaN(numR) && numL > numR;
        }

        case 'ge': {
          const numL = parseFloat(strVal);
          const numR = parseFloat(targetVal);
          return !isNaN(numL) && !isNaN(numR) && numL >= numR;
        }

        default:
          return left === right;
      }
    }

    case 'role': {
      if (!atom.role) return true;
      const targetRole = atom.role.trim().toLowerCase();
      if (userContext?.roles && userContext.roles.length > 0) {
        return userContext.roles.some((r) => r.trim().toLowerCase() === targetRole);
      }
      if (userContext?.role) {
        return userContext.role.trim().toLowerCase() === targetRole;
      }
      return true; // If no user context, allow by default in builder/preview
    }

    case 'field_not_empty': {
      const rawVal = getFieldValue(values, atom.field);
      return !isValueEmpty(rawVal);
    }

    case 'date': {
      const rawVal = getFieldValue(values, atom.field);
      if (!rawVal) return false;
      const dateVal = new Date(String(rawVal)).getTime();
      if (isNaN(dateVal)) return false;
      const target = atom.value === 'now' || !atom.value ? Date.now() : new Date(String(atom.value)).getTime();
      if (isNaN(target)) return false;

      const op = atom.operator || 'ge';
      switch (op) {
        case 'lt':
          return dateVal < target;
        case 'le':
          return dateVal <= target;
        case 'gt':
          return dateVal > target;
        case 'ge':
          return dateVal >= target;
        case 'eq':
          return Math.abs(dateVal - target) < 86400000;
        default:
          return dateVal >= target;
      }
    }

    case 'related': {
      const rawVal = getFieldValue(values, atom.relationship_field);
      if (!rawVal) return false;
      return true;
    }

    case 'person_group': {
      const rawVal = getFieldValue(values, atom.relationship_field);
      if (!rawVal) return false;
      return true;
    }

    case 'workflow_status': {
      const currentStatus = String(getFieldValue(values, '_workflow_status') ?? getFieldValue(values, '_workflow_stage') ?? getFieldValue(values, 'workflow_stage') ?? getFieldValue(values, 'stage') ?? getFieldValue(values, 'status') ?? '').trim().toLowerCase();
      const rawStatus = String(getFieldValue(values, 'status') ?? '').trim().toLowerCase();
      const rawStage = String(getFieldValue(values, '_workflow_stage') ?? getFieldValue(values, 'workflow_stage') ?? getFieldValue(values, 'stage') ?? '').trim().toLowerCase();
      const targetVal = String(atom.value ?? '').trim().toLowerCase();
      const op = atom.operator || 'eq';
      if (op === 'ne' || op === 'not_equal') {
        return currentStatus !== targetVal && rawStatus !== targetVal && rawStage !== targetVal;
      }
      if (op === 'in' || op === 'is_one_of') {
        const allowed = Array.isArray(atom.value)
          ? atom.value.map((v) => String(v).trim().toLowerCase())
          : targetVal.split(',').map((s) => s.trim().toLowerCase());
        return (
          allowed.includes(currentStatus) ||
          allowed.includes(rawStatus) ||
          allowed.includes(rawStage)
        );
      }
      if (op === 'not_in' || op === 'is_none_of') {
        const notAllowed = Array.isArray(atom.value)
          ? atom.value.map((v) => String(v).trim().toLowerCase())
          : targetVal.split(',').map((s) => s.trim().toLowerCase());
        return (
          !notAllowed.includes(currentStatus) &&
          !notAllowed.includes(rawStatus) &&
          !notAllowed.includes(rawStage)
        );
      }
      return (
        currentStatus === targetVal ||
        rawStatus === targetVal ||
        rawStage === targetVal
      );
    }

    case 'expression': {
      return true;
    }

    default:
      return true;
  }
}

/**
 * Evaluates a structured ConditionGroup AST against values.
 */
export function evaluateConditionGroup(
  group?: ConditionGroup | null,
  values: Record<string, unknown> = {},
  userContext?: { role?: string; roles?: string[] }
): boolean {
  if (!group || !group.rules || group.rules.length === 0) return true;

  const isOr = (group.logic || 'AND').toUpperCase() === 'OR';
  const evaluateChild = (node: ConditionRuleNode): boolean => {
    if (node && typeof node === 'object' && !('type' in node) && 'group' in node && node.group && typeof node.group === 'object') {
      return evaluateConditionGroup(node.group, values, userContext);
    }
    return evaluateConditionAtom(node as ConditionAtom, values, userContext);
  };

  let passed = isOr ? group.rules.some(evaluateChild) : group.rules.every(evaluateChild);
  if (group.negate) passed = !passed;
  return passed;
}

/**
 * Evaluates a centralized ConditionDefinition AST.
 */
export function evaluateConditionDefinition(
  def: ConditionDefinition,
  values: Record<string, unknown> = {},
  userContext?: { role?: string; roles?: string[] }
): boolean {
  if (!def || !def.definition) return true;
  return evaluateConditionGroup(def.definition, values, userContext);
}

// -----------------------------------------------------------------------------
// Legacy & Unified Condition Rule Normalization
// -----------------------------------------------------------------------------

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
 * Evaluates a single legacy rule clause against current form values.
 */
export function evaluateSingleRule(
  rule: ConditionRule,
  values: Record<string, unknown> = {}
): boolean {
  const rawVal = getFieldValue(values, rule.field);
  const strVal = rawVal !== undefined && rawVal !== null ? String(rawVal).trim() : '';
  const condVal = (rule.value || '').trim();
  const operator = rule.operator || 'equals';

  switch (operator) {
    case 'equals': {
      const lowStr = strVal.toLowerCase();
      const lowCond = condVal.toLowerCase();
      const bLeft = lowStr === 'true' || lowStr === 'yes' || lowStr === '1' ? true : (lowStr === 'false' || lowStr === 'no' || lowStr === '0' ? false : null);
      const bRight = lowCond === 'true' || lowCond === 'yes' || lowCond === '1' ? true : (lowCond === 'false' || lowCond === 'no' || lowCond === '0' ? false : null);
      if (bLeft !== null && bRight !== null) {
        return bLeft === bRight;
      }
      return lowStr === lowCond;
    }

    case 'not_equals': {
      const lowStr = strVal.toLowerCase();
      const lowCond = condVal.toLowerCase();
      const bLeft = lowStr === 'true' || lowStr === 'yes' || lowStr === '1' ? true : (lowStr === 'false' || lowStr === 'no' || lowStr === '0' ? false : null);
      const bRight = lowCond === 'true' || lowCond === 'yes' || lowCond === '1' ? true : (lowCond === 'false' || lowCond === 'no' || lowCond === '0' ? false : null);
      if (bLeft !== null && bRight !== null) {
        return bLeft !== bRight;
      }
      return lowStr !== lowCond;
    }

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
 * Supports both centralized condition_id lookup and legacy inline rules.
 */
export function isConditionMatched(
  condition?: VisibilityCondition | null,
  values: Record<string, unknown> = {},
  conditionDefs?: ConditionDefinition[] | Record<string, ConditionDefinition> | null
): boolean {
  if (!condition) return false;

  // 1. Centralized condition reference
  if (condition.condition_id) {
    const map = toConditionMap(conditionDefs);
    const def = map[condition.condition_id];
    if (def) {
      return evaluateConditionDefinition(def, values);
    }
  }

  // 2. Legacy rules array
  const rules = getConditionRules(condition);
  if (rules.length === 0) return false;

  const matchType = condition.matchType || 'all';
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
  values: Record<string, unknown> = {},
  conditionDefs?: ConditionDefinition[] | Record<string, ConditionDefinition> | null
): boolean {
  if (!condition) return true;
  const hasCentral = Boolean(condition.condition_id);
  const rules = getConditionRules(condition);
  if (!hasCentral && rules.length === 0) return true;

  const action = condition.action || 'show';
  if (action !== 'hide' && action !== 'show') {
    return true; // Not a visibility rule; always visible
  }

  const matched = isConditionMatched(condition, values, conditionDefs);
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
  values: Record<string, unknown> = {},
  conditionDefs?: ConditionDefinition[] | Record<string, ConditionDefinition> | null
): boolean {
  if (!condition) return false;
  const hasCentral = Boolean(condition.condition_id);
  const rules = getConditionRules(condition);
  if (!hasCentral && rules.length === 0) return false;

  const action = condition.action;
  if (action !== 'readonly' && action !== 'editable') {
    return false; // Not a read-only rule
  }

  const matched = isConditionMatched(condition, values, conditionDefs);
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
  values: Record<string, unknown> = {},
  conditionDefs?: ConditionDefinition[] | Record<string, ConditionDefinition> | null
): boolean {
  return evaluateVisibility(condition, values, conditionDefs);
}

/**
 * Checks whether an EntityFormItem is currently visible, checking both its parent
 * group's condition (if grouped) and the item's own condition.
 */
export function isItemVisible(
  item: EntityFormItem,
  allItems: EntityFormItem[],
  values: Record<string, unknown> = {},
  conditionDefs?: ConditionDefinition[] | Record<string, ConditionDefinition> | null
): boolean {
  // 1. Check parent group visibility condition
  const groupId = item.groupId ?? item.group_id;
  if (groupId) {
    const parentGroup = allItems.find(
      (it) => it.isGroup && (it.groupId === groupId || it.group_id === groupId || it.i === groupId)
    );
    if (parentGroup) {
      const groupCond = parentGroup.visibilityCondition ?? parentGroup.visibility_condition;
      if (!evaluateVisibility(groupCond, values, conditionDefs)) {
        return false;
      }
    }
  }

  // 2. Check item's own visibility condition
  const itemCond = item.visibilityCondition ?? item.visibility_condition;
  return evaluateVisibility(itemCond, values, conditionDefs);
}

/**
 * Checks whether an EntityFormItem is currently read-only, checking:
 * 1. Parent group's condition (if grouped)
 * 2. Parent tab's condition (if tabs provided)
 * 3. Item's own condition
 */
export function isItemReadOnly(
  item: EntityFormItem,
  allItems: EntityFormItem[],
  values: Record<string, unknown> = {},
  conditionDefs?: ConditionDefinition[] | Record<string, ConditionDefinition> | null,
  tabs?: FormTab[]
): boolean {
  // 1. Check parent group read-only condition
  const groupId = item.groupId ?? item.group_id;
  if (groupId) {
    const parentGroup = allItems.find(
      (it) => it.isGroup && (it.groupId === groupId || it.group_id === groupId || it.i === groupId)
    );
    if (parentGroup) {
      const groupCond = parentGroup.visibilityCondition ?? parentGroup.visibility_condition;
      if (evaluateReadOnly(groupCond, values, conditionDefs)) {
        return true;
      }
    }
  }

  // 2. Check parent tab read-only condition
  if (tabs && tabs.length > 0) {
    const tabId = item.tabId ?? (item as any).tab_id ?? tabs[0]?.id;
    const parentTab = tabs.find((t) => t.id === tabId);
    if (parentTab?.visibility_condition) {
      const tabCond = parentTab.visibility_condition;
      if (tabCond.action === 'readonly' || tabCond.action === 'editable') {
        if (evaluateReadOnly(tabCond, values, conditionDefs)) {
          return true;
        }
      }
    }
  }

  // 3. Check item's own read-only condition
  const itemCond = item.visibilityCondition ?? item.visibility_condition;
  return evaluateReadOnly(itemCond, values, conditionDefs);
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
export function formatConditionSummary(
  condition?: VisibilityCondition | null,
  conditionDefs?: ConditionDefinition[] | Record<string, ConditionDefinition> | null
): string {
  if (!condition) return 'Always active';

  const action = condition.action || 'show';
  const actionLabel =
    action === 'hide'
      ? 'Hide when'
      : action === 'show'
      ? 'Show when'
      : action === 'readonly'
      ? 'Disable / Read-Only when'
      : 'Enable / Editable when';

  // 1. Central condition reference
  if (condition.condition_id) {
    const map = toConditionMap(conditionDefs);
    const def = map[condition.condition_id];
    if (def) {
      return `${actionLabel} [${def.label}] (v${def.current_version})`;
    }
    return `${actionLabel} condition [${condition.condition_id}]`;
  }

  // 2. Legacy rules
  const rules = getConditionRules(condition);
  if (rules.length === 0) return 'Always active';

  const joiner = condition.matchType === 'any' ? ' OR ' : ' AND ';
  const rulesText = rules.map(formatRuleSummary).join(joiner);
  return `${actionLabel} ${rulesText}`;
}

/**
 * Evaluates whether a FormTab should be displayed based on entity values,
 * workflow status, and centralized conditions.
 */
export function isTabVisible(
  tab: FormTab,
  values: Record<string, unknown> = {},
  conditionDefs?: ConditionDefinition[] | Record<string, ConditionDefinition> | null,
  userContext?: { role?: string; roles?: string[] }
): boolean {
  if (!tab) return true;
  if (!tab.condition_id && !tab.visibility_condition) return true;

  if (tab.visibility_condition) {
    const action = tab.visibility_condition.action || 'show';
    // Read-only / Editable action tabs are always visible in the tab bar
    if (action === 'readonly' || action === 'editable') {
      return true;
    }
    return evaluateVisibility(tab.visibility_condition, values, conditionDefs);
  }

  if (tab.condition_id) {
    const map = toConditionMap(conditionDefs);
    const def = map[tab.condition_id];
    if (def) {
      return evaluateConditionDefinition(def, values, userContext);
    }
    return true;
  }

  return true;
}

/**
 * Evaluates whether a FormTab is marked read-only based on condition rules.
 * Returns true if the tab and its fields should be read-only/disabled.
 */
export function isTabReadOnly(
  tab: FormTab,
  values: Record<string, unknown> = {},
  conditionDefs?: ConditionDefinition[] | Record<string, ConditionDefinition> | null,
  userContext?: { role?: string; roles?: string[] }
): boolean {
  if (!tab || !tab.visibility_condition) return false;
  const action = tab.visibility_condition.action;
  if (action !== 'readonly' && action !== 'editable') return false;
  return evaluateReadOnly(tab.visibility_condition, values, conditionDefs);
}



