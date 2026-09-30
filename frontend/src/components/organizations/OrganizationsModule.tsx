import React, { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { useHashRoute, navigate } from '../../lib/router';
import { InfoTooltip } from '../people/InfoTooltip';
import { OrganizationsSidebar } from './OrganizationsSidebar';
import { OrganizationsView } from './OrganizationsView';
import { OrganizationEditor } from './OrganizationEditor';
import { CompanySetsView } from './CompanySetsView';
import { CompanySetEditor } from './CompanySetEditor';
import { CompaniesView } from './CompaniesView';
import { LocationsView } from './LocationsView';
import { AssetDrilldownView } from './AssetDrilldownView';
import { ClassificationsView } from './ClassificationsView';
import { MetersView } from './MetersView';

export const OrganizationsModule: React.FC = () => {
  const route = useHashRoute();
  const [collapsed, setCollapsed] = useState(false);

  // Determine subview from route path
  const isCompanySets = route.path.startsWith('/organizations/company-sets');
  const isCompanies = route.path.startsWith('/organizations/companies');
  const isLocations = route.path.startsWith('/organizations/locations');
  const isAssets = route.path.startsWith('/organizations/assets');
  const isClassifications = route.path.startsWith('/organizations/classifications');
  const isMeters = route.path.startsWith('/organizations/meters');
  const isOrgs = !isCompanySets && !isCompanies && !isLocations && !isAssets && !isClassifications && !isMeters;

  // IDs
  const companySetId = isCompanySets && route.path !== '/organizations/company-sets' ? route.id : undefined;
  const orgId = isOrgs && route.path !== '/organizations' ? route.id : undefined;

  // Breadcrumb information
  const getBreadcrumb = () => {
    if (isMeters) {
      return {
        section: 'Meters & Condition Monitoring',
        path: '/organizations/meters',
        detail: null,
      };
    }
    if (isClassifications) {
      return {
        section: 'Classifications & Specifications',
        path: '/organizations/classifications',
        detail: null,
      };
    }
    if (isCompanySets) {
      return {
        section: 'Company Sets',
        path: '/organizations/company-sets',
        detail: companySetId ? (companySetId === 'new' ? 'New Company Set' : `Set: ${companySetId}`) : null,
      };
    }
    if (isCompanies) {
      return {
        section: 'Companies (Vendors)',
        path: '/organizations/companies',
        detail: null,
      };
    }
    if (isLocations) {
      return {
        section: 'Sites & Locations',
        path: '/organizations/locations',
        detail: null,
      };
    }
    if (isAssets) {
      return {
        section: 'Asset Hierarchy',
        path: '/organizations/assets',
        detail: null,
      };
    }
    return {
      section: 'Organizations',
      path: '/organizations',
      detail: orgId ? (orgId === 'new' ? 'New Organization' : `Org: ${orgId}`) : null,
    };
  };

  const breadcrumb = getBreadcrumb();

  return (
    <div className="flex h-full w-full flex-row min-h-0 overflow-hidden bg-white">
      {/* Secondary Sidebar for Admin & Assets */}
      <OrganizationsSidebar
        currentPath={route.path}
        onNavigate={(p) => navigate(p)}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed(!collapsed)}
        onNewOrganization={() => navigate('/organizations/new')}
        onNewCompanySet={() => navigate('/organizations/company-sets/new')}
        onNewCompany={() => navigate('/organizations/companies')}
        onNewLocation={() => navigate('/organizations/locations')}
        onNewAsset={() => navigate('/organizations/assets')}
        onNewClassification={() => navigate('/organizations/classifications')}
        onNewMeter={() => navigate('/organizations/meters')}
      />

      {/* Main Content Area inside Surface */}
      <div className="flex flex-1 flex-col min-w-0 h-full overflow-hidden">
        {/* Top Breadcrumb Header Bar inside Surface */}
        <div className="flex items-center justify-between border-b border-gray-200 bg-white px-5 py-2.5 shrink-0">
          <div className="flex items-center gap-1.5 text-xs text-gray-500 font-medium">
            <span
              onClick={() => navigate('/organizations')}
              className="hover:text-gray-800 cursor-pointer transition-colors"
            >
              Admin
            </span>
            <ChevronRight className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            <span
              onClick={() => navigate(breadcrumb.path)}
              className={`transition-colors ${
                breadcrumb.detail
                  ? 'hover:text-gray-800 cursor-pointer'
                  : 'font-semibold text-gray-900'
              }`}
            >
              {breadcrumb.section}
            </span>
            {breadcrumb.detail && (
              <>
                <ChevronRight className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                <span className="font-semibold text-sky-800">
                  {breadcrumb.detail}
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            <InfoTooltip text="Enterprise Multi-Org Architecture: Partitions enterprise operations across System, Sets (Company Sets & Item Sets), Organizations (legal/financial entity, base currency, GL accounts), Sites, Multi-Level Location & Asset Hierarchy, Enterprise Classifications & Specifications, and Meters & Condition Monitoring." />
          </div>
        </div>

        {/* Dynamic View Component */}
        <div className="flex-1 overflow-hidden min-h-0 bg-white">
          {isMeters ? (
            <MetersView />
          ) : isClassifications ? (
            <ClassificationsView
              onNavigateToAsset={(siteId, assetId) => navigate('/organizations/assets')}
              onNavigateToLocation={(siteId, locationId) => navigate('/organizations/locations')}
            />
          ) : isLocations ? (
            <LocationsView onNavigateToHierarchy={() => navigate('/organizations/assets')} />
          ) : isAssets ? (
            <AssetDrilldownView />
          ) : isCompanySets ? (
            companySetId ? (
              <CompanySetEditor
                setId={companySetId}
                onBack={() => navigate('/organizations/company-sets')}
              />
            ) : (
              <CompanySetsView
                onSelectSet={(sid) => navigate(`/organizations/company-sets/${encodeURIComponent(sid)}`)}
              />
            )
          ) : isCompanies ? (
            <CompaniesView />
          ) : orgId ? (
            <OrganizationEditor
              orgId={orgId}
              onBack={() => navigate('/organizations')}
            />
          ) : (
            <OrganizationsView
              onSelectOrg={(oid) => navigate(`/organizations/${encodeURIComponent(oid)}`)}
              onNewOrg={() => navigate('/organizations/new')}
            />
          )}
        </div>
      </div>
    </div>
  );
};
