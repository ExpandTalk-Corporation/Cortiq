import React, { useState } from 'react';
import { NavigationAnalytics } from '@/components/dashboard/NavigationAnalytics';
import { LinkClickCounts } from '@/components/dashboard/LinkClickCounts';
import { NavigationSync } from '@/components/dashboard/NavigationSync';
import { DateRangePicker } from '@/components/dashboard/DateRangePicker';
import { DashboardCard } from '@/components/dashboard/DashboardCard';
import { DateRange } from 'react-day-picker';
import type { Site } from '@/types/dashboard';

interface NavigationTabProps {
  selectedSite: Site;
}

export function NavigationTab({ selectedSite }: NavigationTabProps) {
  const [dateRange, setDateRange] = useState<DateRange | undefined>();

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Date Range Picker */}
      <DashboardCard title="Period" variant={1}>
        <DateRangePicker 
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
        />
      </DashboardCard>

      {/* Navigation Sync */}
      {selectedSite && <NavigationSync selectedSite={selectedSite} />}
      
      <NavigationAnalytics
        siteId={selectedSite?.id || null}
        selectedSite={selectedSite}
      />

      <LinkClickCounts siteId={selectedSite?.id || null} />
    </div>
  );
}