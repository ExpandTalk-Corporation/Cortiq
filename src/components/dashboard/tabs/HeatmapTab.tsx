import React, { useState } from 'react';
import { HeatmapVisualization } from '@/components/dashboard/HeatmapVisualization';
import { ScrollDepthChart } from '@/components/dashboard/ScrollDepthChart';
import { PageSelector } from '@/components/dashboard/PageSelector';
import { HeatmapFilters } from '@/components/dashboard/HeatmapFilters';
import { MobileHeatmapInsights } from '@/components/dashboard/MobileHeatmapInsights';
import { useHeatmapData, type HeatmapFilters as HeatmapFiltersType } from '@/hooks/useHeatmapData';
import type { HeatmapPoint } from '@/types/dashboard';
import type { DateRange } from 'react-day-picker';

interface HeatmapTabProps {
  siteId: string | null;
  selectedSite?: any;
  dateRange?: DateRange;
}

export function HeatmapTab({ siteId, selectedSite, dateRange }: HeatmapTabProps) {
  const [filters, setFilters] = useState<HeatmapFiltersType>({
    deviceType: 'all',
    days: 365, // Show all available data by default
    interactionType: 'click'
  });

  const { 
    heatmapData, 
    topPages, 
    selectedUrl, 
    setSelectedUrl, 
    loading,
    loadHeatmapData
  } = useHeatmapData(siteId);

  const handleFiltersChange = (newFilters: HeatmapFiltersType) => {
    setFilters(newFilters);
  };

  const handleApplyFilters = () => {
    const dr = dateRange?.from && dateRange?.to ? { from: dateRange.from, to: dateRange.to } : undefined;
    loadHeatmapData(filters, dr);
  };

  const isMobileFilter = filters.deviceType === 'mobile';

  React.useEffect(() => {
    if (dateRange?.from && dateRange?.to) {
      const dr = { from: dateRange.from, to: dateRange.to };
      loadHeatmapData(filters, dr);
    }
  }, [dateRange?.from?.getTime(), dateRange?.to?.getTime()]);

  return (
    <div className="space-y-6">
      <PageSelector 
        siteId={siteId || ''}
        selectedPage={selectedUrl}
        onPageChange={setSelectedUrl}
        placeholder="Select page for heatmap analysis"
      />
      
      {/* Visualization first; filters refine it below. */}
      {filters.interactionType === 'scroll' ? (
        <ScrollDepthChart
          heatmapData={heatmapData}
          selectedUrl={selectedUrl}
          loading={loading}
        />
      ) : (
        <HeatmapVisualization
          heatmapData={heatmapData}
          selectedUrl={selectedUrl}
          loading={loading}
          filters={filters}
          siteId={siteId}
        />
      )}

      <HeatmapFilters 
        filters={filters}
        onFiltersChange={handleFiltersChange}
        onApplyFilters={handleApplyFilters}
        loading={loading}
      />
      
      {/* Mobile-specific insights when mobile filter is active */}
      {isMobileFilter && (
        <MobileHeatmapInsights 
          heatmapData={heatmapData}
          loading={loading}
        />
      )}
      
    </div>
  );
}