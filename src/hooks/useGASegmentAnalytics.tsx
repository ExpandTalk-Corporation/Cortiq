import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { rangeBounds } from '@/lib/dashboard/filters';

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
    // First-party tracking data as fallback, same range (end day inclusive)
    const { start, end } = rangeBounds(startDate, endDate);

    const { data: sessions } = await supabase
      .from('tracking_sessions')
      .select('device_type, duration_seconds, referrer, session_id')
      .eq('site_id', siteId)
      .gte('started_at', start)
      .lt('started_at', end);

    if (!sessions || sessions.length === 0) {
      setSegmentMetrics([]);
      return;
    }

    // Gruppera per enhet
    const deviceStats = sessions.reduce((acc, session) => {
      const device = session.device_type || 'unknown';
      if (!acc[device]) {
        acc[device] = { sessions: 0, totalDuration: 0 };
      }
      acc[device].sessions++;
      acc[device].totalDuration += session.duration_seconds || 0;
      return acc;
    }, {} as Record<string, { sessions: number; totalDuration: number }>);

    const deviceSegments: GASegment[] = Object.entries(deviceStats).map(([device, stats]) => ({
      id: device,
      name: device === 'mobile' ? 'Mobile' : device === 'desktop' ? 'Desktop' : device,
      sessions: stats.sessions,
      users: stats.sessions, // Approximation
      conversions: 0,
      conversionRate: 0,
      bounceRate: 0,
      avgSessionDuration: stats.sessions > 0 ? stats.totalDuration / stats.sessions : 0,
      percentage: (stats.sessions / sessions.length) * 100
    }));

    const fallbackMetric: GASegmentMetric = {
      name: 'Device segment (internal data)',
      totalValue: sessions.length,
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