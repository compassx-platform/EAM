import React, { useState, useEffect } from 'react';
import { Badge } from '../../design-system/components/Badge';
import { Button } from '../../design-system/components/Button';
import { CreateEntityModal } from './CreateEntityModal';
import { EntityInstance } from '../../types';
import { api } from '../../api/client';
import {
  Plus,
  Search,
  Filter,
  ArrowUpDown,
  Clock,
  Link as LinkIcon,
  CheckCircle,
  FileText,
  AlertTriangle,
} from 'lucide-react';

interface EntityListViewProps {
  entityType: string;
  onSelectEntity: (entityId: string) => void;
}

export const EntityListView: React.FC<EntityListViewProps> = ({
  entityType,
  onSelectEntity,
}) => {
  const [entities, setEntities] = useState<EntityInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const loadEntities = async () => {
    setLoading(true);
    try {
      const res = await api.listEntities(entityType, statusFilter || undefined, search || undefined);
      setEntities(res.items || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEntities();
  }, [entityType, statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadEntities();
  };

  const displayName = entityType === 'workorder' ? 'Work Order' : entityType === 'permit' ? 'Permit to Work' : entityType;

  // Extract distinct statuses for filter
  const distinctStatuses = Array.from(new Set(entities.map((e) => e.status)));

  return (
    <div className="space-y-4">
      {/* Header and Action controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-[var(--cx-color-text)]">
            {displayName} Management
          </h2>
          <p className="text-xs text-[var(--cx-color-text-muted)]">
            Query-side materialized table cache derived from immutable append-only event log.
          </p>
        </div>

        <Button
          variant="primary"
          onClick={() => setIsCreateOpen(true)}
          icon={<Plus className="w-4 h-4" />}
        >
          Create {displayName}
        </Button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3 bg-[var(--cx-color-surface)] border border-[var(--cx-color-border)] rounded-[var(--cx-radius-md)] p-3">
        <form onSubmit={handleSearchSubmit} className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
          <input
            type="text"
            className="cx-input pl-9"
            placeholder={`Search ${displayName} by title, ID, or custom field...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </form>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            className="cx-select sm:w-44 text-xs"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="Draft">Draft</option>
            <option value="Requested">Requested</option>
            <option value="Submitted">Submitted</option>
            <option value="RiskAssessed">RiskAssessed</option>
            <option value="Issued">Issued</option>
            <option value="Active">Active</option>
            <option value="SupervisorApproved">SupervisorApproved</option>
            <option value="InProgress">InProgress</option>
            <option value="Completed">Completed</option>
            <option value="HandedBack">HandedBack</option>
            <option value="Closed">Closed</option>
            <option value="Expired">Expired</option>
            <option value="Cancelled">Cancelled</option>
          </select>

          <Button size="sm" variant="secondary" onClick={loadEntities}>
            Refresh
          </Button>
        </div>
      </div>

      {/* Materialized Table */}
      <div className="bg-[var(--cx-color-surface)] border border-[var(--cx-color-border)] rounded-[var(--cx-radius-lg)] overflow-hidden shadow-xs">
        {loading ? (
          <div className="p-8 text-center text-xs text-[var(--cx-color-text-muted)] animate-pulse">
            Loading {displayName} records...
          </div>
        ) : entities.length === 0 ? (
          <div className="p-8 text-center text-xs text-[var(--cx-color-text-muted)]">
            No {displayName} records found matching the filter criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="cx-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Title / Summary</th>
                  {entityType === 'workorder' && <th>Priority</th>}
                  {entityType === 'workorder' && <th>Cost</th>}
                  {entityType === 'workorder' && <th>Linked Permit</th>}
                  {entityType === 'permit' && <th>Permit Type</th>}
                  {entityType === 'permit' && <th>Location</th>}
                  {entityType === 'permit' && <th>Expiry</th>}
                  <th>Version</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {entities.map((item) => {
                  const cf = item.custom_fields || {};
                  return (
                    <tr
                      key={item.id}
                      onClick={() => onSelectEntity(item.id)}
                      className="cursor-pointer transition-colors hover:bg-[var(--cx-color-surface-hover)]"
                    >
                      <td className="w-32">
                        <Badge variant="status" status={item.status}>
                          {item.status}
                        </Badge>
                      </td>
                      <td className="font-medium text-[var(--cx-color-text)]">
                        <div className="font-semibold">{cf.title || 'Untitled'}</div>
                        <div className="text-[11px] text-[var(--cx-color-text-muted)] font-mono">
                          ID: {item.id.substring(0, 8)}...
                        </div>
                      </td>

                      {entityType === 'workorder' && (
                        <td>
                          {cf.priority ? (
                            <Badge
                              variant={
                                cf.priority === 'Critical' || cf.priority === 'High'
                                  ? 'error'
                                  : cf.priority === 'Medium'
                                  ? 'warning'
                                  : 'default'
                              }
                              size="sm"
                            >
                              {cf.priority}
                            </Badge>
                          ) : (
                            '-'
                          )}
                        </td>
                      )}

                      {entityType === 'workorder' && (
                        <td className="font-mono text-xs">
                          {cf.estimated_cost ? `$${Number(cf.estimated_cost).toLocaleString()}` : '-'}
                        </td>
                      )}

                      {entityType === 'workorder' && (
                        <td>
                          {cf.linked_permit_id ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-mono text-[var(--cx-color-brand-primary)] bg-blue-50 dark:bg-blue-950/50 px-2 py-0.5 rounded border border-blue-200 dark:border-blue-800">
                              <LinkIcon className="w-3 h-3" />
                              {cf.linked_permit_id.substring(0, 8)}...
                            </span>
                          ) : (
                            <span className="text-gray-400 italic text-[11px]">Unlinked</span>
                          )}
                        </td>
                      )}

                      {entityType === 'permit' && (
                        <td>
                          <Badge variant="primary" size="sm">
                            {cf.permit_type || 'General'}
                          </Badge>
                        </td>
                      )}

                      {entityType === 'permit' && (
                        <td className="text-xs text-[var(--cx-color-text)]">
                          {cf.location || '-'}
                        </td>
                      )}

                      {entityType === 'permit' && (
                        <td className="text-[11px] text-[var(--cx-color-text-muted)] font-mono">
                          {cf.expiry_date ? new Date(cf.expiry_date).toLocaleDateString() : '-'}
                        </td>
                      )}

                      <td className="text-[11px] text-[var(--cx-color-text-muted)] font-mono">
                        {item.workflow_version}
                      </td>

                      <td className="text-[11px] text-[var(--cx-color-text-muted)] whitespace-nowrap">
                        {new Date(item.updated_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Modal */}
      <CreateEntityModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        entityType={entityType}
        onCreated={(created) => {
          loadEntities();
          onSelectEntity(created.id);
        }}
      />
    </div>
  );
};
