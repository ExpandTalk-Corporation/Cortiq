import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { HeatmapPoint } from '@/types/dashboard';

export interface PageHeatmapData {
  url: string;
  pageViews: number;
  heatmapPoints: HeatmapPoint[];
}

export interface HeatmapFilters {
  deviceType?: 'desktop' | 'mobile' | 'tablet' | 'all';
  days?: number;
  interactionType?: 'click' | 'scroll' | 'mousemove' | 'all';
}

export function useHeatmapData(siteId: string | null) {
  const [heatmapData, setHeatmapData] = useState<HeatmapPoint[]>([]);
  const [topPages, setTopPages] = useState<PageHeatmapData[]>([]);
  const [selectedUrl, setSelectedUrl] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const loadTopPages = async (siteId: string) => {
    try {
      setLoading(true);

      // Top pages over the full history, aggregated server-side (GROUP BY + LIMIT).
      // The previous client-side count only saw the newest 1000 rows PostgREST returns,
      // so "top pages" was silently wrong on busy sites. Ownership enforced in the RPC.
      const { data, error: pageError } = await supabase.rpc('get_top_pages', {
        p_site_id: siteId,
        p_limit: 20,
      });

      if (pageError) throw pageError;

      const sortedPages: PageHeatmapData[] = ((data as { url: string; pageViews: number }[]) ?? [])
        .map((p) => ({ url: p.url, pageViews: p.pageViews, heatmapPoints: [] }));

      setTopPages(sortedPages);

      // Auto-select the most visited page
      if (sortedPages.length > 0 && !selectedUrl) {
        setSelectedUrl(sortedPages[0].url);
      }
    } catch (error) {
      console.error('Error loading top pages:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadHeatmapData = async (siteId: string, url: string, filters: HeatmapFilters = {}, dateRange?: { from: Date; to: Date }) => {
    if (!url) return;
    
    try {
      setLoading(true);
      const { deviceType = 'all', days = 365, interactionType = 'click' } = filters;
      
      let query = supabase
        .from('heatmap_data')
        .select('x_coordinate, y_coordinate, grid_x, grid_y, viewport_width, viewport_height, intensity, interaction_type, device_type, url, created_at')
        .eq('site_id', siteId)
        .eq('url', url)
        .order('intensity', { ascending: false })
        .limit(625);
      
      // Apply date filter: prefer explicit dateRange, else days
      if (dateRange?.from && dateRange?.to) {
        const fromIso = new Date(dateRange.from).toISOString();
        const toBase = new Date(dateRange.to);
        const today = new Date();
        const toIso = new Date(Math.min(toBase.getTime(), today.getTime())).toISOString();
        query = query.gte('created_at', fromIso).lte('created_at', toIso);
      } else if (days && days < 365) {
        const filterDate = new Date();
        filterDate.setDate(filterDate.getDate() - days);
        query = query.gte('created_at', filterDate.toISOString());
      }

      if (deviceType !== 'all') {
        query = query.eq('device_type', deviceType);
      }

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
  }, [siteId]);

  useEffect(() => {
    if (siteId && selectedUrl) {
      // Load with default filters: all device types, 365 days, click interactions
      loadHeatmapData(siteId, selectedUrl, { deviceType: 'all', days: 365, interactionType: 'click' });
    }
  }, [siteId, selectedUrl]);

  return { 
    heatmapData, 
    topPages, 
    selectedUrl, 
    setSelectedUrl, 
    loading,
    loadHeatmapData: (filters: HeatmapFilters, dateRange?: { from: Date; to: Date }) => siteId && selectedUrl ? loadHeatmapData(siteId, selectedUrl, filters, dateRange) : Promise.resolve()
  };
}