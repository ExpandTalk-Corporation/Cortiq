import React from 'react';
import { NavigationFlow } from '@/components/dashboard/NavigationFlow';
import { LinkClickCounts } from '@/components/dashboard/LinkClickCounts';
import type { Site } from '@/types/dashboard';

interface NavigationTabProps {
  selectedSite: Site;
}

// Both widgets follow the dashboard's global date range. The previous analytics widget
// read a navigation table that nothing writes, so it is no longer shown.
export function NavigationTab({ selectedSite }: NavigationTabProps) {
  return (
    <div className="space-y-6 animate-fade-in">
      <NavigationFlow siteId={selectedSite.id} />
      <LinkClickCounts siteId={selectedSite?.id || null} />
    </div>
  );
}
