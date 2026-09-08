export const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  // Common
  Draft: { bg: '#F3F4F6', text: '#374151', border: '#E5E7EB' },
  Submitted: { bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE' },
  Requested: { bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE' },
  
  // Approvals & Progress
  SupervisorApproved: { bg: '#ECFDF5', text: '#047857', border: '#A7F3D0' },
  RiskAssessed: { bg: '#FFFBEB', text: '#B45309', border: '#FDE68A' },
  Issued: { bg: '#F5F3FF', text: '#6D28D9', border: '#DDD6FE' },
  Active: { bg: '#ECFDF5', text: '#065F46', border: '#6EE7B7' },
  InProgress: { bg: '#EFF6FF', text: '#2563EB', border: '#93C5FD' },
  
  // Final states
  Completed: { bg: '#F0FDF4', text: '#15803D', border: '#BBF7D0' },
  HandedBack: { bg: '#F0FDF4', text: '#15803D', border: '#BBF7D0' },
  Closed: { bg: '#F9FAFB', text: '#4B5563', border: '#E5E7EB' },
  
  // Negative / Expiry
  Expired: { bg: '#FFF1F2', text: '#BE123C', border: '#FECDD3' },
  Rejected: { bg: '#FEF2F2', text: '#B91C1C', border: '#FECACA' },
  Cancelled: { bg: '#F3F4F6', text: '#6B7280', border: '#D1D5DB' },
};

export const getStatusStyle = (status: string) => {
  return STATUS_COLORS[status] || { bg: '#F3F4F6', text: '#4B5563', border: '#E5E7EB' };
};
