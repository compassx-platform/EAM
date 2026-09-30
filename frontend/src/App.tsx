import { useCallback, useState } from 'react';
import { WorkflowList } from './components/WorkflowList';
import { WorkflowBuilder } from './components/builder/WorkflowBuilder';
import { EntitiesView } from './components/entities/EntitiesView';
import { EntityDesigner } from './components/entities/EntityDesigner';
import { RuntimeWorkspace } from './components/runtime/RuntimeWorkspace';
import { EntityCreateForm } from './components/runtime/EntityCreateForm';
import { FormList } from './components/forms/FormList';
import { FormBuilder } from './components/forms/FormBuilder';
import { ListsView } from './components/lists/ListsView';
import { ListEditor } from './components/lists/ListEditor';
import { ConditionList } from './components/conditions/ConditionList';
import { PeopleView } from './components/people/PeopleView';
import { PersonEditor } from './components/people/PersonEditor';
import { GroupsView } from './components/people/GroupsView';
import { GroupEditor } from './components/people/GroupEditor';
import { RolesView } from './components/roles/RolesView';
import { RoleEditor } from './components/roles/RoleEditor';
import { EscalationsView } from './components/escalations';
import { OrganizationsModule } from './components/organizations';
import { DocumentsModule } from './components/documents';
import { SystemSettingsPage } from './components/settings/SystemSettingsPage';
import { MainSidebar, type MainNavTab } from './components/navigation/MainSidebar';
import type { Workflow } from './types';
import { useHashRoute, navigate } from './lib/router';

function App() {
  const route = useHashRoute();
  const [listTick, setListTick] = useState(0);

  const refreshList = useCallback(() => setListTick((t) => t + 1), []);

  const tab: MainNavTab = route.path.startsWith('/settings')
    ? 'settings'
    : route.path.startsWith('/records') || route.path.startsWith('/create')
    ? 'records'
    : route.path.startsWith('/documents')
      ? 'documents'
      : route.path.startsWith('/entities')
        ? 'entities'
        : route.path.startsWith('/forms')
          ? 'forms'
          : route.path.startsWith('/lists')
            ? 'lists'
            : route.path.startsWith('/conditions')
              ? 'conditions'
              : route.path.startsWith('/people') || route.path.startsWith('/roles')
                ? 'people'
                : route.path.startsWith('/escalations')
                  ? 'escalations'
                  : route.path.startsWith('/organizations')
                    ? 'organizations'
                    : 'workflows';

  const switchTab = (t: MainNavTab) => {
    if (t === 'settings') navigate('/settings');
    else if (t === 'records') navigate('/records');
    else if (t === 'documents') navigate('/documents');
    else if (t === 'entities') navigate('/entities');
    else if (t === 'forms') navigate('/forms');
    else if (t === 'lists') navigate('/lists');
    else if (t === 'conditions') navigate('/conditions');
    else if (t === 'people') navigate('/people');
    else if (t === 'escalations') navigate('/escalations');
    else if (t === 'organizations') navigate('/organizations');
    else navigate('/workflows');
    setListTick((n) => n + 1);
  };

  const builderId = route.path === '/workflows/new' ? null : route.path.startsWith('/workflows/') ? route.id : undefined;
  const formType = route.path.startsWith('/forms/') ? route.id : null;
  const listKey = route.path.startsWith('/lists/') ? route.id : null;
  const designerEntity = route.path === '/entities/design' ? null : route.path.startsWith('/entities/design/') ? route.id : undefined;

  const isPeopleRoles = route.path === '/people/roles' || route.path === '/roles';
  const roleId = route.path.startsWith('/people/roles/') ? route.id : route.path.startsWith('/roles/') ? route.id : undefined;

  const isPeopleGroups = !isPeopleRoles && !roleId && route.path === '/people/groups';
  const peopleGroupId = route.path.startsWith('/people/groups/') ? route.id : undefined;
  const personId = !isPeopleRoles && !roleId && !isPeopleGroups && !peopleGroupId && route.path.startsWith('/people/') ? route.id : undefined;

  const createType = route.path === '/create' ? route.query.get('type') : null;

  return (
    <div className="flex h-screen w-screen flex-row overflow-hidden bg-[#F7F7F7] text-gray-900">
      {/* 1. Main Primary Sidebar (Full Height on Left, bg-[#F7F7F7]) */}
      <MainSidebar activeTab={tab} onNavigate={switchTab} />

      {/* 2. Main Surface Container: bit of gap/padding around the rounded surface card */}
      <div className="flex-1 min-w-0 h-full p-2 sm:p-2.5 flex flex-col overflow-hidden bg-[#F7F7F7]">
        {/* The Single Unified Rounded Surface Card (Hosts secondary sidebars & content directly) */}
        <main
          id="workspace-surface"
          data-testid="workspace-surface"
          className="h-full w-full overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-2xs flex flex-col min-h-0"
        >
          {createType !== null ? (
            <EntityCreateForm
              entityType={createType}
              onBack={() => navigate('/records', { type: createType })}
            />
          ) : tab === 'settings' ? (
            <SystemSettingsPage />
          ) : tab === 'organizations' ? (
            <OrganizationsModule />
          ) : tab === 'records' ? (
            <RuntimeWorkspace />
          ) : tab === 'documents' ? (
            <DocumentsModule />
          ) : tab === 'entities' ? (
            designerEntity !== undefined ? (
              <EntityDesigner entityName={designerEntity} />
            ) : (
              <EntitiesView />
            )
          ) : tab === 'forms' ? (
            formType !== null ? (
              <FormBuilder
                key={formType}
                entityType={formType}
                onBack={() => navigate('/forms')}
                onChanged={refreshList}
              />
            ) : (
              <FormList onBuild={(t) => navigate(`/forms/${encodeURIComponent(t)}`)} />
            )
          ) : tab === 'lists' ? (
            listKey !== null ? (
              <ListEditor
                key={listKey}
                listKey={listKey}
                onBack={() => navigate('/lists')}
                onChanged={refreshList}
              />
            ) : (
              <ListsView
                tick={listTick}
                onEdit={(k) => navigate(`/lists/${encodeURIComponent(k)}`)}
              />
            )
          ) : tab === 'conditions' ? (
            <ConditionList />
          ) : tab === 'escalations' ? (
            <EscalationsView />
          ) : tab === 'people' ? (
            roleId !== undefined ? (
              <RoleEditor
                key={roleId}
                roleId={roleId}
                onBack={() => navigate('/people/roles')}
              />
            ) : isPeopleRoles ? (
              <RolesView onSelectRole={(r) => navigate(`/people/roles/${encodeURIComponent(r)}`)} />
            ) : peopleGroupId !== undefined ? (
              <GroupEditor
                key={peopleGroupId}
                groupName={peopleGroupId}
                onBack={() => navigate('/people/groups')}
              />
            ) : isPeopleGroups ? (
              <GroupsView onSelectGroup={(g) => navigate(`/people/groups/${encodeURIComponent(g)}`)} />
            ) : personId !== undefined ? (
              <PersonEditor
                key={personId}
                personId={personId}
                onBack={() => navigate('/people')}
              />
            ) : (
              <PeopleView onSelectPerson={(pid) => navigate(`/people/${encodeURIComponent(pid)}`)} />
            )
          ) : builderId !== undefined ? (
            <WorkflowBuilder
              key={builderId ?? 'new'}
              workflowId={builderId}
              onBack={() => navigate('/workflows')}
              onListRefresh={refreshList}
            />
          ) : (
            <WorkflowList
              key={listTick}
              onNew={() => navigate('/workflows/new')}
              onEdit={(wf: Workflow) => navigate(`/workflows/${wf.id}`)}
            />
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
