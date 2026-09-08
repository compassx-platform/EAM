import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { Sidebar, NavigationPage } from './components/Sidebar';
import { DashboardPage } from './pages/DashboardPage';
import { EntityPage } from './pages/EntityPage';
import { WorkflowEditorPage } from './pages/WorkflowEditorPage';
import { GateRegistryPage } from './pages/GateRegistryPage';
import { FieldRegistryPage } from './pages/FieldRegistryPage';
import { UserManagementPage } from './pages/UserManagementPage';
import { AuditLogPage } from './pages/AuditLogPage';
import { api } from './api/client';
import { SystemStats } from './types';

export function App() {
  const [currentPage, setCurrentPage] = useState<NavigationPage>('dashboard');
  const [stats, setStats] = useState<SystemStats | null>(null);

  const refreshData = () => {
    api.getStats().then(setStats).catch(console.error);
  };

  useEffect(() => {
    refreshData();
    const timer = setInterval(refreshData, 15000);
    return () => clearInterval(timer);
  }, []);

  const handleNavigate = (page: string, entityType?: string) => {
    setCurrentPage(page as NavigationPage);
  };

  const getPageTitle = (page: NavigationPage): string => {
    switch (page) {
      case 'dashboard':
        return 'System Overview & Interlocking Dashboard';
      case 'workorders':
        return 'Work Orders Materialized Cache';
      case 'permits':
        return 'Permits to Work Materialized Cache';
      case 'workflows':
        return 'Workflow Architecture & State Machine Designer';
      case 'gates':
        return 'Deterministic Enforcement Gate Registry';
      case 'fields':
        return 'Entity Custom Field Schema Registry';
      case 'audit':
        return 'Append-Only Event Sourcing Audit Log';
      case 'users':
        return 'Native User Identities & Roles (RBAC)';
      default:
        return 'CompassX EAM';
    }
  };

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-row bg-[var(--cx-color-bg)] text-[var(--cx-color-text)]">
      {/* Left App Sidebar */}
      <Sidebar
        currentPage={currentPage}
        onNavigate={(p) => setCurrentPage(p)}
        stats={{
          workordersCount: stats?.workorders.total,
          permitsCount: stats?.permits.total,
          activePermits: stats?.permits.active,
        }}
      />

      {/* Main Content Workspace */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        <Navbar pageTitle={getPageTitle(currentPage)} onRefresh={refreshData} />

        <main className="flex-1 min-w-0 p-6 overflow-y-auto bg-[var(--cx-color-bg)]">
          {currentPage === 'dashboard' && (
            <DashboardPage onNavigate={handleNavigate} />
          )}

          {currentPage === 'workorders' && (
            <EntityPage entityType="workorder" />
          )}

          {currentPage === 'permits' && (
            <EntityPage entityType="permit" />
          )}

          {currentPage === 'workflows' && (
            <WorkflowEditorPage />
          )}

          {currentPage === 'gates' && (
            <GateRegistryPage />
          )}

          {currentPage === 'fields' && (
            <FieldRegistryPage />
          )}

          {currentPage === 'audit' && (
            <AuditLogPage />
          )}

          {currentPage === 'users' && (
            <UserManagementPage />
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
