const PICKER_TYPES = new Set(['asset', 'asset_table', 'safety_plan']);

/** Registry picker types win over a layout that was saved as plain text. */
export function pickerType(layoutType: string | null | undefined, registeredType: string | null | undefined): string {
  if (registeredType && PICKER_TYPES.has(registeredType)) return registeredType;
  return layoutType || registeredType || 'text';
}
