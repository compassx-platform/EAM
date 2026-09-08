import React, { useState, useEffect } from 'react';
import { AppUser, AppRole } from '../types';
import { api } from '../api/client';
import { Button } from '../design-system/components/Button';
import { Badge } from '../design-system/components/Badge';
import { Modal } from '../design-system/components/Modal';
import { Users, Plus, Shield, CheckCircle, UserPlus } from 'lucide-react';

export const UserManagementPage: React.FC = () => {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [uRes, rRes] = await Promise.all([api.getUsers(), api.getRoles()]);
      setUsers(uRes);
      setRoles(rRes);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim() || !newName.trim()) return;

    try {
      await api.createUser({
        email: newEmail.trim(),
        display_name: newName.trim(),
        roles: selectedRoles,
      });
      setIsUserModalOpen(false);
      setNewEmail('');
      setNewName('');
      setSelectedRoles([]);
      loadData();
    } catch (err: any) {
      alert(`Error creating user: ${err.message}`);
    }
  };

  const toggleRole = (rName: string) => {
    setSelectedRoles((prev) =>
      prev.includes(rName) ? prev.filter((r) => r !== rName) : [...prev, rName]
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--cx-color-border)] pb-3">
        <div>
          <h2 className="text-base font-bold text-[var(--cx-color-text)] flex items-center gap-2">
            <Users className="w-4 h-4 text-[var(--cx-color-brand-primary)]" />
            <span>App-Native Users & Roles (RBAC)</span>
          </h2>
          <p className="text-xs text-[var(--cx-color-text-muted)]">
            D9 app-native authentication and role assignments driving <code>role_check</code> transition gates.
          </p>
        </div>

        <Button
          size="sm"
          variant="primary"
          onClick={() => setIsUserModalOpen(true)}
          icon={<UserPlus className="w-3.5 h-3.5" />}
        >
          Add App User
        </Button>
      </div>

      <div className="bg-[var(--cx-color-surface)] border border-[var(--cx-color-border)] rounded-[var(--cx-radius-lg)] overflow-hidden shadow-xs">
        <table className="cx-table">
          <thead>
            <tr>
              <th>Display Name</th>
              <th>Email Identity</th>
              <th>Assigned Roles</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td className="font-semibold text-xs text-[var(--cx-color-text)]">
                  {u.display_name}
                </td>
                <td className="font-mono text-xs text-[var(--cx-color-text-muted)]">
                  {u.email}
                </td>
                <td>
                  <div className="flex flex-wrap gap-1">
                    {u.roles.map((r) => (
                      <span
                        key={r}
                        className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
                      >
                        <Shield className="w-3 h-3 text-[var(--cx-color-brand-primary)]" />
                        {r}
                      </span>
                    ))}
                  </div>
                </td>
                <td>
                  <Badge variant={u.active ? 'success' : 'default'} size="sm">
                    {u.active ? 'Active' : 'Inactive'}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create User Modal */}
      <Modal
        isOpen={isUserModalOpen}
        onClose={() => setIsUserModalOpen(false)}
        title="Add User & Assign Roles"
        description="Users execute state machine transitions governed by role_check gates."
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsUserModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleCreateUser}>
              Create User
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreateUser} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[var(--cx-color-text)] mb-1">
              Display Name
            </label>
            <input
              type="text"
              className="cx-input"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. John Doe"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--cx-color-text)] mb-1">
              Email
            </label>
            <input
              type="email"
              className="cx-input font-mono"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="e.g. john.doe@compassx.io"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--cx-color-text)] mb-1">
              Select Roles
            </label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {roles.map((r) => {
                const isSelected = selectedRoles.includes(r.name);
                return (
                  <button
                    type="button"
                    key={r.id}
                    onClick={() => toggleRole(r.name)}
                    className={`flex items-center justify-between p-2 rounded border text-xs text-left transition-colors ${
                      isSelected
                        ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-300 dark:border-blue-700 text-blue-900 dark:text-blue-200 font-semibold'
                        : 'bg-[var(--cx-color-surface)] border-[var(--cx-color-border)] text-[var(--cx-color-text)] hover:bg-[var(--cx-color-surface-hover)]'
                    }`}
                  >
                    <span>{r.name}</span>
                    {isSelected && <CheckCircle className="w-3.5 h-3.5 text-blue-600" />}
                  </button>
                );
              })}
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
};
