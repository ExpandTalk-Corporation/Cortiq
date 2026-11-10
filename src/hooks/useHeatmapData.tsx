import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { HeatmapPoint } from '@/types/dashboard';
import { useDashboardFilters } from '@/contexts/DashboardFiltersContext';

export interface PageHeatmapData {
  url: string;
  clicks: number;
  scrolls: number;
  heatmapPoints: HeatmapPoint[];
}

export interface HeatmapFilters {
  deviceType?: 'desktop' | 'mobile' | 'tablet' | 'all';
  days?: number;
  interactionType?: 'click' | 'scroll' | 'mousemove' | 'all';
}

const SCROLL_MILESTONES = [25, 50, 75, 100];

export function useHeatmapData(siteId: string | null) {
  const { filters } = useDashboardFilters();
  const [heatmapData, setHeatmapData] = useState<HeatmapPoint[]>([]);
  const [topPages, setTopPages] = useState<PageHeatmapData[]>([]);
  const [selectedUrl, setSelectedUrl] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [scrollCounts, setScrollCounts] = useState<Record<number, number>>({});

  const loadTopPages = async (siteId: string) => {
    try {
      setLoading(true);

      // Only pages that have heatmap data in the selected range, member-only paths excluded
      // (the screenshot behind the heatmap is taken logged out). Ownership enforced in the RPC.
      const { data, error: pageError } = await (supabase as any).rpc('get_heatmap_pages', {
        p_site_id: siteId, p_from: filters.from, p_to: filters.to, p_limit: 50,
      });

      if (pageError) throw pageError;

      const sortedPages: PageHeatmapData[] = ((data as { url: string; clicks: number | string; scrolls: number | string }[]) ?? [])
        .map((p) => ({ url: p.url, clicks: Number(p.clicks), scrolls: Number(p.scrolls), heatmapPoints: [] }));

      setTopPages(sortedPages);

      // Select the page with most clicks unless the user picked one that is still listed.
      if (sortedPages.length > 0 && !sortedPages.some((p) => p.url === selectedUrl)) {
        setSelectedUrl(sortedPages[0].url);
      }
    } catch (error) {
      console.error('Error loading heatmap pages:', error);
    } finally {
      setLoading(false);
    }
  };

  // Shared filters for the point query and the scroll milestone counts.
  const applyFilters = <Q extends { gte: any; lte: any; eq: any }>(query: Q, deviceType: string, days: number, dateRange?: { from: Date; to: Date }): Q => {
    let q = query;
    // Apply date filter: prefer explicit dateRange, else days
    if (dateRange?.from && dateRange?.to) {
      const fromIso = new Date(dateRange.from).toISOString();
      const toBase = new Date(dateRange.to);
      const today = new Date();
      const toIso = new Date(Math.min(toBase.getTime(), today.getTime())).toISOString();
      q = q.gte('created_at', fromIso).lte('created_at', toIso);
    } else if (days && days < 365) {
      const filterDate = new Date();
      filterDate.setDate(filterDate.getDate() - days);
      q = q.gte('created_at', filterDate.toISOString());
    }
    if (deviceType !== 'all') {
      q = q.eq('device_type', deviceType);
    }
    return q;
  };

  const loadHeatmapData = async (siteId: string, url: string, filters: HeatmapFilters = {}, dateRange?: { from: Date; to: Date }) => {
    if (!url) return;
    
    try {
      setLoading(true);
      const { deviceType = 'all', days = 365, interactionType = 'click' } = filters;

      if (interactionType === 'scroll') {
        // One row per page view and milestone (y_coordinate = 25/50/75/100). Exact counts per
        // milestone, so busy pages are not cut off by a row limit.
        const results = await Promise.all(SCROLL_MILESTONES.map((m) =>
          applyFilters(
            supabase
              .from('heatmap_data')
              .select('id', { count: 'exact', head: true })
              .eq('site_id', siteId)
              .eq('url', url)
              .eq('interaction_type', 'scroll')
              .eq('y_coordinate', m),
            deviceType, days, dateRange,
          )
        ));
        const failed = results.find((r) => r.error);
        if (failed?.error) throw failed.error;
        setScrollCounts(Object.fromEntries(SCROLL_MILESTONES.map((m, i) => [m, results[i].count ?? 0])));
        return;
      }

      let query = applyFilters(
        supabase
          .from('heatmap_data')
          .select('x_coordinate, y_coordinate, grid_x, grid_y, viewport_width, viewport_height, intensity, interaction_type, device_type, url, created_at')
          .eq('site_id', siteId)
          .eq('url', url)
          .order('intensity', { ascending: false })
          .limit(625),
        deviceType, days, dateRange,
      );

      if (interactionType !== 'all') {
        query = query.or(`interaction_type.eq.${interactionType},interaction_type.like.${interactionType}_%`);
      }

      const { data, error } = await query;

      if (error) throw error;
      setHeatmapData(data || []);
    } catch (error) {
      console.error('Error loading heatmap data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (siteId) {
      loadTopPages(siteId);
    }
  }, [siteId, filters.from, filters.to]);

  useEffect(() => {
    if (siteId && selectedUrl) {
      // Load with default filters: all device types, 365 days, click interactions
      loadHeatmapData(siteId, selectedUrl, { deviceType: 'all', days: 365, interactionType: 'click' });
    }
  }, [siteId, selectedUrl]);

  return { 
    heatmapData, 
    scrollCounts,
    topPages, 
    selectedUrl, 
    setSelectedUrl, 
    loading,
    loadHeatmapData: (filters: HeatmapFilters, dateRange?: { from: Date; to: Date }) => siteId && selectedUrl ? loadHeatmapData(siteId, selectedUrl, filters, dateRange) : Promise.resolve()
  };
}