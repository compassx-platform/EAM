import React, { useState } from 'react';
import { EntityListView } from '../components/Entities/EntityListView';
import { EntityDetailView } from '../components/Entities/EntityDetailView';

interface EntityPageProps {
  entityType: string;
}

export const EntityPage: React.FC<EntityPageProps> = ({ entityType }) => {
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);

  return (
    <div>
      {selectedEntityId ? (
        <EntityDetailView
          entityType={entityType}
          entityId={selectedEntityId}
          onBack={() => setSelectedEntityId(null)}
          onNavigateToEntity={(type, id) => {
            setSelectedEntityId(id);
          }}
        />
      ) : (
        <EntityListView
          entityType={entityType}
          onSelectEntity={(id) => setSelectedEntityId(id)}
        />
      )}
    </div>
  );
};
