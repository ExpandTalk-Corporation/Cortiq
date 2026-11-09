import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface GASegment {
  id: string;
  name: string;
  sessions: number;
  users: number;
  conversions: number;
  conversionRate: number;
  bounceRate: number;
  avgSessionDuration: number;
  percentage: number;
}

export interface GASegmentMetric {
  name: string;
  totalValue: number;
  unit: string;
  segments: GASegment[];
}

/** `range` is the global dashboard date filter (inclusive YYYY-MM-DD). */
export function useGASegmentAnalytics(siteId: string | null, range: { from: string; to: string }) {
  const { from: startDate, to: endDate } = range;
  const [segmentMetrics, setSegmentMetrics] = useState<GASegmentMetric[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasGAIntegration, setHasGAIntegration] = useState(false);
  const { toast } = useToast();

  const loadGASegmentData = async (siteId: string) => {
    setIsLoading(true);
    try {
      // Kontrollera GA-integration först
      const { data: site } = await supabase
        .from('sites')
        .select('ga_integration_enabled, ga_property_id')
        .eq('id', siteId)
        .single();

      if (!site?.ga_integration_enabled || !site?.ga_property_id) {
        setHasGAIntegration(false);
        setSegmentMetrics([]);
        setIsLoading(false);
        return;
      }

      setHasGAIntegration(true);

      // Anropa GA4 API för segmentdata
      const { data: gaData, error } = await supabase.functions.invoke('ga4-segment-data', {
        body: {
          siteId,
          startDate,
          endDate
        }
      });

      if (error) {
        console.error('GA Segment API error:', error);
        // Fallback till intern data
        return loadFallbackSegmentData(siteId);
      }

      if (gaData?.deviceSegments) {
        const deviceMetric: GASegmentMetric = {
          name: 'Device segment',
          totalValue: gaData.totalSessions,
          unit: 'sessions',
          segments: gaData.deviceSegments.map((segment: any) => ({
            id: segment.deviceCategory,
            name: segment.deviceCategory === 'mobile' ? 'Mobile' :
                  segment.deviceCategory === 'desktop' ? 'Desktop' : 'Tablet',
            sessions: segment.sessions,
            users: segment.users,
            conversions: segment.conversions,
            conversionRate: segment.conversionRate,
            bounceRate: segment.bounceRate,
            avgSessionDuration: segment.avgSessionDuration,
            percentage: (segment.sessions / gaData.totalSessions) * 100
          }))
        };

        const channelMetric: GASegmentMetric = {
          name: 'Channel segment',
          totalValue: gaData.totalSessions,
          unit: 'sessions',
          segments: gaData.channelSegments?.map((segment: any) => ({
            id: segment.channelGrouping,
            name: segment.channelGrouping === 'Organic Search' ? 'Organic Search' :
                  segment.channelGrouping === 'Direct' ? 'Direct' :
                  segment.channelGrouping === 'Referral' ? 'Referral' :
                  segment.channelGrouping === 'Social' ? 'Social' : segment.channelGrouping,
            sessions: segment.sessions,
            users: segment.users,
            conversions: segment.conversions,
            conversionRate: segment.conversionRate,
            bounceRate: segment.bounceRate,
            avgSessionDuration: segment.avgSessionDuration,
            percentage: (segment.sessions / gaData.totalSessions) * 100
          })) || []
        };

        const geoMetric: GASegmentMetric = {
          name: 'Geographic segments',
          totalValue: gaData.totalSessions,
          unit: 'sessions',
          segments: gaData.geoSegments?.map((segment: any) => ({
            id: segment.country,
            name: segment.country,
            sessions: segment.sessions,
            users: segment.users,
            conversions: segment.conversions,
            conversionRate: segment.conversionRate,
            bounceRate: segment.bounceRate,
            avgSessionDuration: segment.avgSessionDuration,
            percentage: (segment.sessions / gaData.totalSessions) * 100
          })) || []
        };

        const behaviorMetric: GASegmentMetric = {
          name: 'User behavior',
          totalValue: gaData.totalSessions,
          unit: 'sessions',
          segments: gaData.behaviorSegments?.map((segment: any) => ({
            id: segment.userType,
            name: segment.userType === 'new' ? 'New users' : 'Returning users',
            sessions: segment.sessions,
            users: segment.users,
            conversions: segment.conversions,
            conversionRate: segment.conversionRate,
            bounceRate: segment.bounceRate,
            avgSessionDuration: segment.avgSessionDuration,
            percentage: (segment.sessions / gaData.totalSessions) * 100
          })) || []
        };

        setSegmentMetrics([deviceMetric, channelMetric, geoMetric, behaviorMetric]);
      }

    } catch (error) {
      console.error('Error loading GA segment data:', error);
      toast({
        title: "⚠️ Warning",
        description: "Could not load Google Analytics segment data"
      });
      // Fallback till intern data
      loadFallbackSegmentData(siteId);
    } finally {
      setIsLoading(false);
    }
  };

  const loadFallbackSegmentData = async (siteId: string) => {
    // First-party fallback, counted in the database (get_segment_stats).
    const { data, error } = await (supabase as any).rpc('get_segment_stats', {
      p_site_id: siteId, p_from: startDate, p_to: endDate,
    });
    const totalSessions = Number(data?.total_sessions ?? 0);

    if (error || totalSessions === 0) {
      setSegmentMetrics([]);
      return;
    }

    const deviceSegments: GASegment[] = (data.devices ?? []).map((d: {
      key: string; sessions: number; converting_sessions: number; duration_seconds: number;
    }) => {
      const sessions = Number(d.sessions);
      const conversions = Number(d.converting_sessions);
      return {
        id: d.key,
        name: d.key === 'mobile' ? 'Mobile' : d.key === 'desktop' ? 'Desktop' : d.key,
        sessions,
        users: sessions, // Approximation
        conversions,
        conversionRate: sessions > 0 ? (conversions / sessions) * 100 : 0,
        bounceRate: 0,
        avgSessionDuration: sessions > 0 ? Number(d.duration_seconds) / sessions : 0,
        percentage: (sessions / totalSessions) * 100,
      };
    });

    const fallbackMetric: GASegmentMetric = {
      name: 'Device segment (internal data)',
      totalValue: totalSessions,
      unit: 'sessions',
      segments: deviceSegments
    };

    setSegmentMetrics([fallbackMetric]);
  };

  useEffect(() => {
    if (siteId) {
      loadGASegmentData(siteId);
    } else {
      setSegmentMetrics([]);
    }
  }, [siteId, startDate, endDate]);

  return { segmentMetrics, isLoading, hasGAIntegration };
}