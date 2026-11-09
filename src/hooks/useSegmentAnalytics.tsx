import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface Segment {
  id: string;
  name: string;
  value: number;
  variance: number;
  impact: 'high' | 'medium' | 'low';
  trend: 'up' | 'down' | 'stable';
  volumeImpact: number;
}

export interface SegmentMetric {
  name: string;
  overallValue: number;
  unit: string;
  varianceScore: number;
  segments: Segment[];
  maxVariance: number;
}

export interface SegmentInsight {
  id: number;
  type: string;
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  action: string;
  metric: string;
}

/** `range` is the global dashboard date filter (inclusive YYYY-MM-DD). */
export function useSegmentAnalytics(siteId: string | null, range: { from: string; to: string }) {
  const [segmentMetrics, setSegmentMetrics] = useState<SegmentMetric[]>([]);
  const [insights, setInsights] = useState<SegmentInsight[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const calculateVariance = (segments: { value: number; volumeImpact: number }[]): number => {
    if (segments.length < 2) return 0;
    
    const weightedMean = segments.reduce((sum, seg) => sum + (seg.value * seg.volumeImpact), 0) / 
                        segments.reduce((sum, seg) => sum + seg.volumeImpact, 0);
    
    const variance = segments.reduce((sum, seg) => {
      const diff = seg.value - weightedMean;
      return sum + (diff * diff * seg.volumeImpact);
    }, 0) / segments.reduce((sum, seg) => sum + seg.volumeImpact, 0);
    
    return Math.sqrt(variance) / weightedMean * 100;
  };

  const loadSegmentAnalytics = async (siteId: string) => {
    setIsLoading(true);
    try {
      // Counted in the database (get_segment_stats): every session in the range, and
      // conversions matched to sessions by ID.
      const { data, error } = await (supabase as any).rpc('get_segment_stats', {
        p_site_id: siteId, p_from: range.from, p_to: range.to,
      });

      if (error) throw error;

      const totalSessions = Number(data?.total_sessions ?? 0);
      if (totalSessions === 0) {
        setSegmentMetrics([]);
        setInsights([]);
        setIsLoading(false);
        return;
      }

      type Row = { key: string; sessions: number; converting_sessions: number; conversion_value: number };
      const toStats = (rows: Row[] = []) => Object.fromEntries(rows.map((r) => [r.key, {
        sessions: Number(r.sessions),
        conversions: Number(r.converting_sessions),
        totalValue: Number(r.conversion_value),
      }]));
      const deviceStats = toStats(data.devices);
      const arrivalStats = toStats(data.arrivals);

      // Beräkna konverteringsgrad per enhet
      const deviceSegments: Segment[] = Object.entries(deviceStats).map(([device, stats]) => {
        const conversionRate = stats.sessions > 0 ? (stats.conversions / stats.sessions) * 100 : 0;
        const volumeImpact = stats.sessions / totalSessions * 100;
        
        return {
          id: device,
          name: device === 'mobile' ? 'Mobile' : device === 'desktop' ? 'Desktop' : device === 'tablet' ? 'Tablet' : device,
          value: conversionRate,
          variance: 0, // Beräknas senare
          impact: volumeImpact > 50 ? 'high' : volumeImpact > 20 ? 'medium' : 'low',
          trend: 'stable',
          volumeImpact: volumeImpact
        };
      });

      // Beräkna genomsnittlig konverteringsgrad
      const totalConversions = Object.values(deviceStats).reduce((sum, stats) => sum + stats.conversions, 0);
      const overallConversionRate = totalSessions > 0 ? (totalConversions / totalSessions) * 100 : 0;

      // Beräkna variance för varje segment
      deviceSegments.forEach(segment => {
        segment.variance = overallConversionRate > 0 ? 
          ((segment.value - overallConversionRate) / overallConversionRate) * 100 : 0;
      });

      const conversionMetric: SegmentMetric = {
        name: 'Conversion rate',
        overallValue: overallConversionRate,
        unit: '%',
        varianceScore: calculateVariance(deviceSegments),
        segments: deviceSegments,
        maxVariance: Math.max(...deviceSegments.map(s => Math.abs(s.variance)))
      };

      // Direct vs referred arrival (no referrer vs a referrer).
      const userTypeStats = arrivalStats;

      const userTypeSegments: Segment[] = Object.entries(userTypeStats).map(([type, stats]) => {
        const revenuePerSession = stats.sessions > 0 ? stats.totalValue / stats.sessions : 0;
        const volumeImpact = stats.sessions / totalSessions * 100;
        
        return {
          id: type,
          name: type === 'direct' ? 'Direct' : 'Referred',
          value: revenuePerSession,
          variance: 0,
          impact: volumeImpact > 40 ? 'high' : 'medium',
          trend: 'stable',
          volumeImpact: volumeImpact
        };
      });

      const totalRevenue = Object.values(userTypeStats).reduce((sum, stats) => sum + stats.totalValue, 0);
      const overallRevenuePerSession = totalSessions > 0 ? totalRevenue / totalSessions : 0;

      userTypeSegments.forEach(segment => {
        segment.variance = overallRevenuePerSession > 0 ? 
          ((segment.value - overallRevenuePerSession) / overallRevenuePerSession) * 100 : 0;
      });

      const revenueMetric: SegmentMetric = {
        name: 'Revenue per session',
        overallValue: overallRevenuePerSession,
        unit: 'kr',
        varianceScore: calculateVariance(userTypeSegments),
        segments: userTypeSegments,
        maxVariance: Math.max(...userTypeSegments.map(s => Math.abs(s.variance)))
      };

      const metrics = [conversionMetric];
      if (revenueMetric.overallValue > 0) {
        metrics.push(revenueMetric);
      }

      setSegmentMetrics(metrics);

      // Generera insikter baserat på data
      const generatedInsights: SegmentInsight[] = [];
      
      const mobileSegment = deviceSegments.find(s => s.id === 'mobile');
      const desktopSegment = deviceSegments.find(s => s.id === 'desktop');
      
      if (mobileSegment && desktopSegment && Math.abs(mobileSegment.variance) > 30) {
        generatedInsights.push({
          id: 1,
          type: 'high_variance',
          title: mobileSegment.variance < 0 ? 'Mobile underperforming' : 'Mobile overperforming',
          description: `Mobile converts ${Math.abs(mobileSegment.variance).toFixed(0)}% ${mobileSegment.variance < 0 ? 'worse' : 'better'} than desktop`,
          impact: mobileSegment.volumeImpact > 50 ? 'high' : 'medium',
          action: mobileSegment.variance < 0 ? 'Optimize mobile user experience' : 'Focus more on mobile traffic',
          metric: 'Conversion rate'
        });
      }

      setInsights(generatedInsights);

    } catch (error) {
      console.error('Error loading segment analytics:', error);
      setSegmentMetrics([]);
      setInsights([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (siteId) {
      loadSegmentAnalytics(siteId);
    } else {
      setSegmentMetrics([]);
      setInsights([]);
    }
  }, [siteId, range.from, range.to]);

  return { segmentMetrics, insights, isLoading };
}