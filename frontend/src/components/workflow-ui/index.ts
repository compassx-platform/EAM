// Types & Helpers
export {
  NODE_KINDS,
  KIND_LABEL,
  kindDefaultLabel,
  nextStateLabel,
  edgeIsBranching,
  edgeBranchCount,
  edgeDescription,
  isConditionKind,
  isStopKind,
  isSubprocessKind,
  isActionKind,
} from './types';
export type {
  NodeKind,
  NodeMeta,
  StateNodeData,
  EventEdgeData,
  WorkflowFlowNode,
  WorkflowFlowEdge,
  StudioNotice,
} from './types';

// UI Primitives
export * from './ui';

// Graph & Geometry Utilities
export {
  autoArrangePositions,
  definitionToFlow,
  flowToDefinition,
  validateGraphTopology,
  layoutPosition,
  defaultPositionFor,
  transitionTargetLabel,
} from './graphUtils';
export type { WorkflowDefinitionExtras } from './graphUtils';

// Nodes & Edges
export { StateNode, default as StateNodeComponent } from './StateNode';
export { EventEdge, default as EventEdgeComponent } from './EventEdge';

// Studio Panels & Modals
export { HeaderBar } from './HeaderBar';
export type { HeaderBarProps } from './HeaderBar';
export { LeftRail } from './LeftRail';
export { NodeInspector } from './NodeInspector';
export { ActionInspector } from './ActionInspector';
export { ConditionCard } from './ConditionCard';
export type { ConditionCardProps } from './ConditionCard';
export { ConditionModal } from './ConditionModal';
export { SettingsModal } from './SettingsModal';
export type { SettingsModalProps } from './SettingsModal';
export { TemplateImportModal } from './TemplateImportModal';
export type { TemplateImportModalProps } from './TemplateImportModal';

