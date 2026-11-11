import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Search, ExternalLink, Users, MousePointer, Mail, Share, TrendingUp, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useFilterParams } from '@/hooks/useFilterParams';

interface TrafficSource {
  source: string;
  medium: string;
  sessions: number;
  users: number;
  pageviews: number;
  bounceRate: number;
  avgSessionDuration: number;
  conversions: number;
  percentage: number;
}

interface Site {
  id: string;
  site_name: string;
  ga_property_id?: string;
}

interface TrafficSourcesAnalysisProps {
  siteId: string;
  startDate?: string;
  endDate?: string;
  selectedSite?: Site;
}

const getSourceIcon = (source: string, medium: string) => {
  const sourceLower = source.toLowerCase();
  
  // Google
  if (sourceLower.includes('google')) {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" className="flex-shrink-0">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
      </svg>
    );
  }
  
  // Bing - Förbättrad synlighet
  if (sourceLower.includes('bing')) {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" className="flex-shrink-0">
        <rect width="24" height="24" fill="#0078D4" rx="4"/>
        <path fill="#FFFFFF" d="M6 4v13l3 2 5-2.5V10l3-1.5V6l-8 2V4H6z"/>
      </svg>
    );
  }
  
  // DuckDuckGo - Korrekt logotyp
  if (sourceLower.includes('duckduckgo')) {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" className="flex-shrink-0">
        <circle fill="#DE5833" cx="12" cy="12" r="12"/>
        <path fill="#FFFFFF" d="M12 5c-3.86 0-7 3.14-7 7s3.14 7 7 7 7-3.14 7-7-3.14-7-7-7zm-2.5 4.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5S8 11.83 8 11s.67-1.5 1.5-1.5zm5 0c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5-1.5-.67-1.5-1.5.67-1.5 1.5-1.5zm-2.5 6c-1.66 0-3-1.34-3-3h6c0 1.66-1.34 3-3 3z"/>
      </svg>
    );
  }
  
  // Privacywall
  if (sourceLower.includes('privacywall')) {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" className="flex-shrink-0">
        <path fill="#6366F1" d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/>
        <path fill="#FFFFFF" d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zm0 2c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3z"/>
      </svg>
    );
  }
  
  // Facebook
  if (sourceLower.includes('facebook') || sourceLower.includes('fb')) {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" className="flex-shrink-0">
        <path fill="#1877F2" d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
      </svg>
    );
  }
  
  // Instagram
  if (sourceLower.includes('instagram')) {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" className="flex-shrink-0">
        <path fill="#E4405F" d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073z"/>
        <path fill="#E4405F" d="M12 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4z"/>
      </svg>
    );
  }
  
  // YouTube
  if (sourceLower.includes('youtube')) {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" className="flex-shrink-0">
        <path fill="#FF0000" d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
      </svg>
    );
  }
  
  // Twitter/X
  if (sourceLower.includes('twitter') || sourceLower.includes('x.com')) {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" className="flex-shrink-0">
        <path fill="#000000" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
      </svg>
    );
  }
  
  // LinkedIn
  if (sourceLower.includes('linkedin')) {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" className="flex-shrink-0">
        <path fill="#0A66C2" d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
      </svg>
    );
  }
  
  // Fallback baserat på channel type
  const channel = getChannel(source, medium);
  const channelColor = getChannelColor(channel);
  
  // För vanliga search engines utan specifik logotyp
  if (medium === 'organic') {
    return <Search className="h-6 w-6 text-green-600 flex-shrink-0" />;
  }
  
  // För social media utan specifik logotyp
  if (medium === 'social' || medium === 'social-network') {
    return <Share className="h-6 w-6 text-pink-600 flex-shrink-0" />;
  }
  
  // För email
  if (medium === 'email') {
    return <Mail className="h-6 w-6 text-orange-600 flex-shrink-0" />;
  }
  
  // För referrals
  if (medium === 'referral') {
    return <ExternalLink className="h-6 w-6 text-purple-600 flex-shrink-0" />;
  }
  
  // För direct traffic
  if (source === '(direct)') {
    return <MousePointer className="h-6 w-6 text-blue-600 flex-shrink-0" />;
  }
  
  // Default fallback - färgad cirkel med första bokstaven
  const firstLetter = source.charAt(0).toUpperCase();
  return (
    <div className={`w-6 h-6 rounded-full ${channelColor} flex items-center justify-center text-white text-sm font-bold flex-shrink-0`}>
      {firstLetter}
    </div>
  );
};

const getChannelIcon = (source: string, medium: string) => {
  const channel = getChannel(source, medium);
  switch (channel) {
    case 'Organic Search': return <Search className="h-4 w-4" />;
    case 'Direct': return <MousePointer className="h-4 w-4" />;
    case 'Referral': return <ExternalLink className="h-4 w-4" />;
    case 'Social': return <Share className="h-4 w-4" />;
    case 'Email': return <Mail className="h-4 w-4" />;
    case 'Paid Search': return <TrendingUp className="h-4 w-4" />;
    default: return <Users className="h-4 w-4" />;
  }
};

const getChannel = (source: string, medium: string): string => {
  // Google Analytics standard channel grouping logic
  if (medium === 'organic') return 'Organic Search';
  if (source === '(direct)' && (medium === '(none)' || medium === '(not set)')) return 'Direct';
  if (medium === 'referral') return 'Referral';
  if (['social', 'social-network', 'social-media', 'sm', 'social network', 'social media'].includes(medium)) return 'Social';
  if (['email', 'e-mail', 'e_mail', 'e mail'].includes(medium)) return 'Email';
  if (['cpc', 'ppc', 'paidsearch'].includes(medium)) return 'Paid Search';
  if (medium === 'affiliate') return 'Affiliates';
  if (medium === 'display') return 'Display';
  return 'Other';
};

const getChannelColor = (channel: string): string => {
  switch (channel) {
    case 'Organic Search': return 'bg-green-500';
    case 'Direct': return 'bg-blue-500';
    case 'Referral': return 'bg-purple-500';
    case 'Social': return 'bg-pink-500';
    case 'Email': return 'bg-orange-500';
    case 'Paid Search': return 'bg-red-500';
    case 'Affiliates': return 'bg-yellow-500';
    case 'Display': return 'bg-indigo-500';
    default: return 'bg-gray-500';
  }
};

const getDateRangeText = (startDate?: string, endDate?: string): string => {
  if (!startDate || !endDate) {
    return 'Last 30 days';
  }

  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffTime = Math.abs(end.getTime() - start.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays <= 1) {
    return 'Last 24 hours';
  } else if (diffDays <= 7) {
    return 'Last 7 days';
  } else if (diffDays <= 30) {
    return 'Last 30 days';
  } else if (diffDays <= 90) {
    return 'Last 90 days';
  } else if (diffDays <= 365) {
    return `${diffDays} days`;
  } else {
    return 'Last year';
  }
};

export function TrafficSourcesAnalysis({ siteId, startDate, endDate, selectedSite }: TrafficSourcesAnalysisProps) {
  const [trafficSources, setTrafficSources] = useState<TrafficSource[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [hasGAIntegration, setHasGAIntegration] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [usingFallback, setUsingFallback] = useState(false);
  const { toast } = useToast();
  // Global URL and segment filters. GA4 cannot apply CortIQ segments or the URL rule
  // (visit viewed a page under the path), so a filtered view always uses first-party data.
  const { p_path, p_segment } = useFilterParams();
  const filtered = p_path !== null || p_segment !== null;
  const filterKey = JSON.stringify([p_path, p_segment]);

  const SOURCES_PER_PAGE = 10;

  const loadTrafficSources = async () => {
    setIsLoading(true);
    try {
      // Check if site has GA Property ID configured
      const { data: site } = await supabase
        .from('sites')
        .select('ga_property_id, site_name')
        .eq('id', siteId)
        .single();

      // Without GA4 the first-party tracking data is the source, not an empty card.
      if (!site?.ga_property_id || filtered) {
        setHasGAIntegration(!!site?.ga_property_id);
        setUsingFallback(true);
        await loadTrackingData();
        return;
      }

      setHasGAIntegration(true);

      // Call GA4 API via edge function
      const { data: gaData, error: gaError } = await supabase.functions.invoke('ga4-traffic-sources', {
        body: {
          siteId: siteId,
          startDate: startDate ? new Date(startDate).toISOString().split('T')[0] : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          endDate: endDate ? new Date(endDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
        }
      });

      if (gaError || gaData?.error) {
        console.error('GA API error:', gaError || gaData?.error);
        // Inform user and fallback to tracking data if GA fails
        const details = (gaError?.message || gaData?.details || '').toString();
        const isPermIssue = details.includes('PERMISSION_DENIED');
        setUsingFallback(true);
        toast({
          title: isPermIssue ? 'Missing GA4 permission' : 'Could not fetch GA4 data',
          description: isPermIssue
            ? 'The service account lacks access to the GA4 property. Showing internal tracking data instead.'
            : 'Showing internal tracking data instead.',
          variant: 'destructive',
        });
        await loadTrackingData();
        return;
      }

      setUsingFallback(false);

      if (gaData?.success && gaData.trafficSources && gaData.trafficSources.length > 0) {
        console.log('GA4 data received:', gaData);
        
        // Convert GA4 data to our format
        const convertedSources = gaData.trafficSources.map((source: any) => ({
          source: source.source,
          medium: source.medium,
          sessions: source.sessions,
          users: source.users,
          pageviews: source.pageViews,
          bounceRate: 0, // Not available from GA4 API
          avgSessionDuration: 0, // Not available from GA4 API
          conversions: 0, // Would need separate conversion API call
          percentage: 0 // Will be calculated below
        }));

        // Calculate percentages
        const totalSessions = convertedSources.reduce((sum: number, s: any) => sum + s.sessions, 0);
        convertedSources.forEach((source: any) => {
          source.percentage = totalSessions > 0 ? (source.sessions / totalSessions) * 100 : 0;
        });

        setTrafficSources(convertedSources);
        setLastUpdated(new Date());
        return;
      } else {
        console.log('GA4 returned no traffic sources, falling back to tracking data. GA data:', gaData);
        // Fallback to tracking data if no sources returned
        await loadTrackingData();
        return;
      }

      // If GA4 API fails, fallback to tracking data
      await loadTrackingData();

    } catch (error) {
      console.error('Error loading traffic sources:', error);
      // Fallback to tracking data
      await loadTrackingData();
    } finally {
      setIsLoading(false);
    }
  };

  const loadTrackingData = async () => {
    try {
      // First-party fallback, counted in the database (get_source_breakdown) so every session
      // in the range is included, not only the first 1,000 rows.
      const today = new Date().toISOString().slice(0, 10);
      const defaultFrom = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const { data, error } = await (supabase as any).rpc('get_source_breakdown', {
        p_site_id: siteId,
        p_from: startDate ? startDate.slice(0, 10) : defaultFrom,
        p_to: endDate ? endDate.slice(0, 10) : today,
        p_path,
        p_segment,
      });
      if (error) throw error;

      const totalSessions = Number(data?.total_sessions ?? 0);
      const sources: TrafficSource[] = (data?.sources ?? []).map((s: {
        source: string; medium: string; sessions: number; page_views: number;
        bounces: number; duration_seconds: number; conversions: number;
      }) => {
        const sessions = Number(s.sessions);
        return {
          source: s.source,
          medium: s.medium,
          sessions,
          users: sessions, // No visitor ID on sessions; one user per session.
          pageviews: Number(s.page_views),
          bounceRate: sessions > 0 ? (Number(s.bounces) / sessions) * 100 : 0,
          avgSessionDuration: sessions > 0 ? Number(s.duration_seconds) / sessions : 0,
          conversions: Number(s.conversions),
          percentage: totalSessions > 0 ? (sessions / totalSessions) * 100 : 0,
        };
      });

      setTrafficSources(sources);
      setLastUpdated(new Date());
    } catch (error) {
      toast({
        title: "Error",
        description: "Could not load traffic data. Check your GA integration."
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (siteId) {
      loadTrafficSources();
    }
  }, [siteId, startDate, endDate, filterKey]);

  const totalSessions = trafficSources.reduce((sum, source) => sum + source.sessions, 0);
  const totalUsers = trafficSources.reduce((sum, source) => sum + source.users, 0);
  const totalConversions = trafficSources.reduce((sum, source) => sum + source.conversions, 0);
  const conversionRate = totalSessions > 0 ? (totalConversions / totalSessions) * 100 : 0;

  const channelData = trafficSources.reduce((acc, source) => {
    const channel = getChannel(source.source, source.medium);
    if (!acc[channel]) {
      acc[channel] = { sessions: 0, users: 0, conversions: 0, sources: [] };
    }
    acc[channel].sessions += source.sessions;
    acc[channel].users += source.users;
    acc[channel].conversions += source.conversions;
    acc[channel].sources.push(source);
    return acc;
  }, {} as Record<string, { sessions: number; users: number; conversions: number; sources: TrafficSource[] }>);

  // Pagination logic
  const totalPages = Math.ceil(trafficSources.length / SOURCES_PER_PAGE);
  const startIndex = (currentPage - 1) * SOURCES_PER_PAGE;
  const endIndex = startIndex + SOURCES_PER_PAGE;
  const paginatedSources = trafficSources.slice(startIndex, endIndex);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Traffic Sources & Channels
        </CardTitle>
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Period: {getDateRangeText(startDate, endDate)} • Real data from your website
          </p>
          {lastUpdated && (
            <Badge variant="secondary" className="text-xs">
              Updated: {lastUpdated.toLocaleTimeString()}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {usingFallback && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {filtered && hasGAIntegration
                ? 'Showing CortIQ tracking data: GA4 cannot apply the URL or segment filter. Clear the filter to see GA4 sources.'
                : hasGAIntegration
                ? 'Showing CortIQ tracking data because GA4 data could not be fetched. Check that the service account has access to the GA4 property.'
                : 'Sources from CortIQ tracking (visitors who accepted analytics). Connect GA4 under Settings → Integrations to compare with Google Analytics.'}
            </AlertDescription>
          </Alert>
        )}
        {isLoading ? (
          <div className="space-y-4">
            <div className="h-16 bg-muted rounded animate-pulse" />
            <div className="h-16 bg-muted rounded animate-pulse" />
            <div className="h-16 bg-muted rounded animate-pulse" />
          </div>
        ) : (
          <>
            {/* Performance Metrics - Moved to top */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 rounded-lg bg-blue-50 border border-blue-200">
                <div className="text-2xl font-bold text-blue-600">{totalSessions.toLocaleString()}</div>
                <div className="text-sm text-blue-600/70">Total sessions</div>
              </div>
              <div className="text-center p-4 rounded-lg bg-green-50 border border-green-200">
              <div className="text-2xl font-bold text-green-600">{totalUsers.toLocaleString()}</div>
              <div className="text-sm text-green-600/70">Active users</div>
              </div>
              <div className="text-center p-4 rounded-lg bg-purple-50 border border-purple-200">
                <div className="text-2xl font-bold text-purple-600">{totalConversions.toLocaleString()}</div>
                <div className="text-sm text-purple-600/70">Conversions</div>
              </div>
              <div className="text-center p-4 rounded-lg bg-orange-50 border border-orange-200">
                <div className="text-2xl font-bold text-orange-600">{conversionRate.toFixed(1)}%</div>
                <div className="text-sm text-orange-600/70">Conversion rate</div>
              </div>
            </div>

            {/* All Traffic Sources */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-medium">All traffic sources ({trafficSources.length})</h3>
                {totalPages > 1 && (
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      {currentPage} of {totalPages}
                    </span>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                      disabled={currentPage === totalPages}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
              <div className="space-y-3">
                {paginatedSources.map((source, index) => {
                  const channel = getChannel(source.source, source.medium);
                  const sourceConversionRate = source.sessions > 0 ? (source.conversions / source.sessions) * 100 : 0;
                  return (
                    <div key={`${source.source}-${source.medium}`} className="p-4 rounded-lg border bg-card">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          {getSourceIcon(source.source, source.medium)}
                          <div>
                            <div className="font-medium flex items-center gap-2">
                              {source.source}
                              <Badge variant="secondary" className="text-xs">{source.medium}</Badge>
                            </div>
                            <div className="text-sm text-muted-foreground">{channel}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-medium">{source.sessions.toLocaleString()}</div>
                          <div className="text-sm text-muted-foreground">{source.percentage.toFixed(1)}%</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex-1 bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-gradient-to-r from-blue-500 to-blue-600 h-2 rounded-full transition-all duration-300" 
                            style={{ width: `${source.percentage}%` }}
                          />
                        </div>
                        <div className="text-xs text-muted-foreground min-w-0 flex gap-2">
                          <span>{source.conversions} conv.</span>
                          <span>({sourceConversionRate.toFixed(1)}%)</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-between items-center pt-4 border-t">
              <Button variant="outline" size="sm" onClick={loadTrafficSources} disabled={isLoading}>
                {isLoading ? 'Loading...' : 'Refresh data'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (selectedSite?.ga_property_id) {
                    window.open(`https://analytics.google.com/analytics/web/#/p${selectedSite.ga_property_id}/reports/acquisition-traffic-overview`, '_blank');
                  } else {
                    window.open('https://analytics.google.com', '_blank');
                  }
                }}
              >
                <ExternalLink className="h-4 w-4 mr-1" />
                Open GA
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}