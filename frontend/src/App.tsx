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
import type { Workflow } from './types';
import { GitBranch, Layers, PenTool, ListChecks, ShieldCheck, Inbox, Users } from 'lucide-react';
import { useHashRoute, navigate } from './lib/router';

type Tab = 'records' | 'workflows' | 'entities' | 'forms' | 'lists' | 'conditions' | 'people';

function App() {
  const route = useHashRoute();
  const [listTick, setListTick] = useState(0);

  const refreshList = useCallback(() => setListTick((t) => t + 1), []);

  const tab: Tab = route.path.startsWith('/records')
    ? 'records'
    : route.path.startsWith('/entities')
      ? 'entities'
      : route.path.startsWith('/forms')
        ? 'forms'
        : route.path.startsWith('/lists')
          ? 'lists'
          : route.path.startsWith('/conditions')
            ? 'conditions'
            : route.path.startsWith('/people')
              ? 'people'
              : 'workflows';

  const switchTab = (t: Tab) => {
    if (t === 'records') navigate('/records');
    else if (t === 'entities') navigate('/entities');
    else if (t === 'forms') navigate('/forms');
    else if (t === 'lists') navigate('/lists');
    else if (t === 'conditions') navigate('/conditions');
    else if (t === 'people') navigate('/people');
    else navigate('/workflows');
    setListTick((n) => n + 1);
  };

  const builderId = route.path === '/workflows/new' ? null : route.path.startsWith('/workflows/') ? route.id : undefined;
  const formType = route.path.startsWith('/forms/') ? route.id : null;
  const listKey = route.path.startsWith('/lists/') ? route.id : null;
  const designerEntity = route.path === '/entities/design' ? null : route.path.startsWith('/entities/design/') ? route.id : undefined;

  const isPeopleGroups = route.path === '/people/groups';
  const peopleGroupId = route.path.startsWith('/people/groups/') ? route.id : undefined;
  const personId = !isPeopleGroups && !peopleGroupId && route.path.startsWith('/people/') ? route.id : undefined;

  const createType = route.path === '/create' ? route.query.get('type') : null;

  const navBtn = (t: Tab, label: string, Icon: typeof GitBranch) => (
    <button
      onClick={() => switchTab(t)}
      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-all ${
        tab === t
          ? 'bg-white font-semibold text-gray-900 shadow-xs border border-gray-200/80'
          : 'font-medium text-gray-600 hover:bg-white/60 hover:text-gray-900'
      }`}
    >
      <Icon className={`h-3.5 w-3.5 ${tab === t ? 'text-gray-800' : 'text-gray-500'}`} />
      <span>{label}</span>
    </button>
  );

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-100/75">
      {/* Top Surface Header */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-gray-200/80 bg-white px-5 shadow-xs">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-900 text-white shadow-xs">
              <GitBranch className="h-4 w-4" />
            </div>
            <span className="text-sm font-bold tracking-tight text-gray-900">CompassX EAM</span>
          </div>

          {/* Segmented Surface Navigation Bar */}
          <nav className="flex items-center gap-1 rounded-xl border border-gray-200/60 bg-gray-100/90 p-1">
            {navBtn('records', 'Records', Inbox)}
            {navBtn('workflows', 'Workflows', GitBranch)}
            {navBtn('entities', 'Entities', Layers)}
            {navBtn('forms', 'Forms', PenTool)}
            {navBtn('lists', 'Lists', ListChecks)}
            {navBtn('conditions', 'Conditions', ShieldCheck)}
            {navBtn('people', 'People', Users)}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          {createType && (
            <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-gray-600">
              New {createType}
            </span>
          )}
          {tab === 'entities' && designerEntity !== undefined && (
            <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-gray-600">
              Entity Designer
            </span>
          )}
          {tab === 'workflows' && builderId !== undefined && (
            <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-600">
              Workflow Builder
            </span>
          )}
          {tab === 'forms' && formType !== null && (
            <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-gray-600">
              Form Builder · {formType}
            </span>
          )}
          {tab === 'lists' && (
            <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-gray-600">
              {listKey === 'new' ? 'New List' : listKey ? `List · ${listKey}` : 'Central Lists'}
            </span>
          )}
          {tab === 'people' && (
            <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-gray-600">
              {peopleGroupId === 'new'
                ? 'New Group'
                : peopleGroupId
                  ? `Group · ${peopleGroupId}`
                  : isPeopleGroups
                    ? 'Person Groups'
                    : personId === 'new'
                      ? 'New Person'
                      : personId
                        ? `Person · ${personId}`
                        : 'People Directory'}
            </span>
          )}
        </div>
      </header>

      {/* Main Shell Viewport hosting the WorkspaceSurface */}
      <main className="min-h-0 flex-1 overflow-hidden p-3 sm:p-4 bg-slate-100/75">
        {/* WorkspaceSurface: The unified primary surface card covering the entire main area */}
        <div
          id="workspace-surface"
          data-testid="workspace-surface"
          className="h-full w-full overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-xs flex flex-col min-h-0"
        >
          {createType !== null ? (
            <EntityCreateForm
              entityType={createType}
              onBack={() => navigate('/records', { type: createType })}
            />
          ) : tab === 'records' ? (
            <RuntimeWorkspace />
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
          ) : tab === 'people' ? (
            peopleGroupId !== undefined ? (
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
        </div>
      </main>
    </div>
  );
}

export default App;
