import { useCallback, useState } from 'react';
import { WorkflowList } from './components/WorkflowList';
import { WorkflowBuilder } from './components/builder/WorkflowBuilder';
import { EntityConsole } from './components/runtime/EntityConsole';
import { EntityCreateForm } from './components/runtime/EntityCreateForm';
import { FormList } from './components/forms/FormList';
import { FormBuilder } from './components/forms/FormBuilder';
import { ListsView } from './components/lists/ListsView';
import { ListEditor } from './components/lists/ListEditor';
import { ConditionList } from './components/conditions/ConditionList';
import type { Workflow } from './types';
import { GitBranch, Layers, PenTool, ListChecks, ShieldCheck } from 'lucide-react';
import { useHashRoute, navigate } from './lib/router';

type Tab = 'workflows' | 'entities' | 'forms' | 'lists' | 'conditions';

function App() {
  const route = useHashRoute();
  const [listTick, setListTick] = useState(0);

  const refreshList = useCallback(() => setListTick((t) => t + 1), []);

  const tab: Tab = route.path.startsWith('/entities')
    ? 'entities'
    : route.path.startsWith('/forms')
      ? 'forms'
      : route.path.startsWith('/lists')
        ? 'lists'
        : route.path.startsWith('/conditions')
          ? 'conditions'
          : 'workflows';

  const switchTab = (t: Tab) => {
    if (t === 'entities') navigate('/entities');
    else if (t === 'forms') navigate('/forms');
    else if (t === 'lists') navigate('/lists');
    else if (t === 'conditions') navigate('/conditions');
    else navigate('/workflows');
    setListTick((n) => n + 1);
  };

  const builderId = route.path === '/workflows/new' ? null : route.path.startsWith('/workflows/') ? route.id : undefined;
  const formType = route.path.startsWith('/forms/') ? route.id : null;
  const listKey = route.path.startsWith('/lists/') ? route.id : null;

  const navBtn = (t: Tab, label: string, Icon: typeof GitBranch) => (
    <button
      onClick={() => switchTab(t)}
      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium transition-colors ${
        tab === t ? 'bg-blue-700 text-white' : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      <Icon className="h-4 w-4" /> {label}
    </button>
  );

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-gray-100">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-5">
        <GitBranch className="h-5 w-5 text-blue-700" />
        <span className="text-sm font-bold text-gray-900">CompassX EAM</span>

        <nav className="ml-4 flex items-center gap-1">
          {navBtn('workflows', 'Workflows', GitBranch)}
          {navBtn('entities', 'Entities', Layers)}
          {navBtn('forms', 'Forms', PenTool)}
          {navBtn('lists', 'Lists', ListChecks)}
          {navBtn('conditions', 'Conditions', ShieldCheck)}
        </nav>

        {tab === 'entities' && route.path === '/entities/new' && (
          <span className="ml-auto rounded-md bg-blue-50 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-blue-700">
            New {route.query.get('type') || 'entity'}
          </span>
        )}
        {tab === 'workflows' && builderId !== undefined && (
          <span className="ml-auto rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-700">
            Workflow Builder
          </span>
        )}
        {tab === 'forms' && formType !== null && (
          <span className="ml-auto rounded-md bg-blue-50 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-blue-700">
            Form Builder · {formType}
          </span>
        )}
        {tab === 'lists' && (
          <span className="ml-auto rounded-md bg-blue-50 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-blue-700">
            {listKey === 'new' ? 'New List' : listKey ? `List · ${listKey}` : 'Central Lists'}
          </span>
        )}
      </header>

      <main className="min-h-0 flex-1 overflow-hidden">
        {tab === 'entities' ? (
          route.path === '/entities/new' ? (
            <div className="h-full overflow-y-auto">
              <EntityCreateForm
                entityType={route.query.get('type') || 'workorder'}
                onBack={() => navigate('/entities', { type: route.query.get('type') || undefined })}
              />
            </div>
          ) : (
            <div className="h-full overflow-y-auto">
              <EntityConsole />
            </div>
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
            <div key={listTick} className="h-full overflow-y-auto">
              <FormList onBuild={(t) => navigate(`/forms/${encodeURIComponent(t)}`)} />
            </div>
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
            <div key={listTick} className="h-full overflow-y-auto">
              <ListsView
                tick={listTick}
                onEdit={(k) => navigate(`/lists/${encodeURIComponent(k)}`)}
              />
            </div>
          )
        ) : tab === 'conditions' ? (
          <div key={listTick} className="h-full overflow-y-auto">
            <ConditionList />
          </div>
        ) : builderId !== undefined ? (
          <WorkflowBuilder
            key={builderId ?? 'new'}
            workflowId={builderId}
            onBack={() => navigate('/workflows')}
            onListRefresh={refreshList}
          />
        ) : (
          <div key={listTick} className="h-full overflow-y-auto">
            <WorkflowList
              onNew={() => navigate('/workflows/new')}
              onEdit={(wf: Workflow) => navigate(`/workflows/${wf.id}`)}
            />
          </div>
        )}
      </main>
    </div>
  );
}

export default App;