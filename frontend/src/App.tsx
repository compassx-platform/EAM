import { useCallback, useState } from 'react';
import { WorkflowList } from './components/WorkflowList';
import { WorkflowBuilder } from './components/builder/WorkflowBuilder';
import { EntityConsole } from './components/runtime/EntityConsole';
import type { Workflow } from './types';
import { GitBranch, Layers } from 'lucide-react';
import { useHashRoute, navigate } from './lib/router';

type Tab = 'workflows' | 'entities';

function App() {
  const route = useHashRoute();
  const [listTick, setListTick] = useState(0);

  const refreshList = useCallback(() => setListTick((t) => t + 1), []);

  const tab: Tab = route.path.startsWith('/entities') ? 'entities' : 'workflows';

  const switchTab = (t: Tab) => {
    if (t === 'entities') navigate('/entities');
    else navigate('/workflows');
    setListTick((n) => n + 1);
  };

  const builderId = route.path === '/workflows/new' ? null : route.path.startsWith('/workflows/') ? route.id : undefined;

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
        </nav>

        {tab === 'workflows' && builderId !== undefined && (
          <span className="ml-auto rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-700">
            Workflow Builder
          </span>
        )}
      </header>

      <main className="min-h-0 flex-1 overflow-hidden">
        {tab === 'entities' ? (
          <div className="h-full overflow-y-auto">
            <EntityConsole />
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