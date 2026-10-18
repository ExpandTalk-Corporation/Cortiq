import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { rangeBounds } from '@/lib/dashboard/filters';

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
      const { start, end } = rangeBounds(range.from, range.to);

      // Sessions in the selected range for the segment analysis
      const { data: sessions, error: sessionError } = await supabase
        .from('tracking_sessions')
        .select('device_type, duration_seconds, page_views, started_at, referrer, session_id')
        .eq('site_id', siteId)
        .gte('started_at', start)
        .lt('started_at', end);

      if (sessionError) throw sessionError;

      // Conversions in the same range
      const { data: conversions, error: conversionError } = await supabase
        .from('conversion_events')
        .select('event_type, event_value, session_id, created_at')
        .eq('site_id', siteId)
        .gte('created_at', start)
        .lt('created_at', end);

      if (conversionError) throw conversionError;

      if (!sessions || sessions.length === 0) {
        setSegmentMetrics([]);
        setInsights([]);
        setIsLoading(false);
        return;
      }

      // Analysera enhetssegment för konverteringsgrad
      const deviceStats = sessions.reduce((acc, session) => {
        const device = session.device_type || 'unknown';
        if (!acc[device]) {
          acc[device] = { sessions: 0, conversions: 0 };
        }
        acc[device].sessions++;
        
        // Räkna konverteringar för denna session
        const sessionConversions = conversions?.filter(c => c.session_id === session.session_id) || [];
        if (sessionConversions.length > 0) {
          acc[device].conversions++;
        }
        
        return acc;
      }, {} as Record<string, { sessions: number; conversions: number }>);

      // Beräkna konverteringsgrad per enhet
      const deviceSegments: Segment[] = Object.entries(deviceStats).map(([device, stats]) => {
        const conversionRate = stats.sessions > 0 ? (stats.conversions / stats.sessions) * 100 : 0;
        const volumeImpact = stats.sessions / sessions.length * 100;
        
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
      const totalSessions = sessions.length;
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

      // Analysera användarsegment (ny vs återkommande baserat på sessioner)
      const userTypeStats = sessions.reduce((acc, session) => {
        // Enkel heuristik: om referrer är tom eller samma domän = direktbesök
        const isReturning = session.referrer && !session.referrer.includes('(direct)');
        const userType = isReturning ? 'returning' : 'new';
        
        if (!acc[userType]) {
          acc[userType] = { sessions: 0, conversions: 0, totalValue: 0 };
        }
        acc[userType].sessions++;
        
        const sessionConversions = conversions?.filter(c => c.session_id === session.session_id) || [];
        if (sessionConversions.length > 0) {
          acc[userType].conversions++;
          acc[userType].totalValue += sessionConversions.reduce((sum, c) => sum + (c.event_value || 0), 0);
        }
        
        return acc;
      }, {} as Record<string, { sessions: number; conversions: number; totalValue: number }>);

      const userTypeSegments: Segment[] = Object.entries(userTypeStats).map(([type, stats]) => {
        const revenuePerSession = stats.sessions > 0 ? stats.totalValue / stats.sessions : 0;
        const volumeImpact = stats.sessions / sessions.length * 100;
        
        return {
          id: type,
          name: type === 'new' ? 'New visitors' : 'Returning',
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