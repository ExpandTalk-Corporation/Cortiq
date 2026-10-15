/**
 * Media Analytics - Video, Audio, Document Tracking
 * Task #22: Media Analytics
 *
 * Handles media event tracking and analytics aggregation
 */

import { createClient } from '../_shared/supabase.ts';

interface MediaEvent {
  media_id: string;
  media_type: 'video' | 'audio' | 'document' | 'image';
  event_type: string;
  current_time?: number;
  target_time?: number;
  duration?: number;
  playback_rate?: number;
  volume?: number;
  is_fullscreen?: boolean;
  is_muted?: boolean;
  quality?: string;
  buffering_duration?: number;
  dropped_frames?: number;
  device_type?: string;
  browser?: string;
  os?: string;
  error_code?: string;
  error_message?: string;
}

interface MediaMetadata {
  media_id: string;
  media_type: string;
  media_url: string;
  media_title?: string;
  media_duration?: number;
  file_size?: number;
  format?: string;
  dimensions?: { width: number; height: number };
  bitrate?: number;
}

// Track media event
async function trackMediaEvent(
  supabase: any,
  siteId: string,
  sessionId: string | null,
  event: MediaEvent
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('media_events')
      .insert({
        site_id: siteId,
        session_id: sessionId,
        media_id: event.media_id,
        media_type: event.media_type,
        event_type: event.event_type,
        event_timestamp: new Date().toISOString(),
        current_time: event.current_time,
        target_time: event.target_time,
        duration: event.duration,
        playback_rate: event.playback_rate,
        volume: event.volume,
        is_fullscreen: event.is_fullscreen || false,
        is_muted: event.is_muted || false,
        quality: event.quality,
        buffering_duration: event.buffering_duration,
        dropped_frames: event.dropped_frames,
        device_type: event.device_type,
        browser: event.browser,
        os: event.os,
        error_code: event.error_code,
        error_message: event.error_message,
      });

    if (error) {
      console.error('Error tracking media event:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in trackMediaEvent:', error);
    return false;
  }
}

// Record or update media metadata
async function recordMediaMetadata(
  supabase: any,
  siteId: string,
  metadata: MediaMetadata
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('media_metadata')
      .upsert({
        site_id: siteId,
        media_id: metadata.media_id,
        media_type: metadata.media_type,
        media_url: metadata.media_url,
        media_title: metadata.media_title,
        media_duration: metadata.media_duration,
        file_size: metadata.file_size,
        format: metadata.format,
        dimensions: metadata.dimensions ? JSON.stringify(metadata.dimensions) : null,
        bitrate: metadata.bitrate,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'site_id,media_id'
      });

    if (error) {
      console.error('Error recording media metadata:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in recordMediaMetadata:', error);
    return false;
  }
}

// Track progress points for completion analysis
async function recordProgressPoint(
  supabase: any,
  siteId: string,
  sessionId: string | null,
  mediaId: string,
  visitorHash: string,
  progressPercentage: number,
  actualTime: number,
  duration: number
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('media_progress_points')
      .insert({
        site_id: siteId,
        session_id: sessionId,
        media_id: mediaId,
        visitor_hash: visitorHash,
        progress_percentage: progressPercentage,
        actual_time: actualTime,
        duration: duration,
      });

    if (error) {
      console.error('Error recording progress point:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in recordProgressPoint:', error);
    return false;
  }
}

// Get media engagement stats
async function getMediaEngagement(
  supabase: any,
  siteId: string,
  mediaId?: string,
  dateRange?: { from: string; to: string }
): Promise<any[]> {
  try {
    let query = supabase
      .from('media_engagement')
      .select('*')
      .eq('site_id', siteId);

    if (mediaId) {
      query = query.eq('media_id', mediaId);
    }

    if (dateRange) {
      query = query
        .gte('date', dateRange.from)
        .lte('date', dateRange.to);
    }

    const { data, error } = await query.order('date', { ascending: false });

    if (error) {
      console.error('Error fetching media engagement:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in getMediaEngagement:', error);
    return [];
  }
}

// Get media performance timeline
async function getMediaPerformanceTimeline(
  supabase: any,
  siteId: string,
  mediaId: string,
  date: string
): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from('media_performance_timeline')
      .select('*')
      .eq('site_id', siteId)
      .eq('media_id', mediaId)
      .eq('date', date)
      .order('hour', { ascending: true });

    if (error) {
      console.error('Error fetching timeline:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in getMediaPerformanceTimeline:', error);
    return [];
  }
}

// Get quality distribution
async function getQualityDistribution(
  supabase: any,
  siteId: string,
  mediaId: string,
  dateRange?: { from: string; to: string }
): Promise<any[]> {
  try {
    let query = supabase
      .from('media_quality_distribution')
      .select('*')
      .eq('site_id', siteId)
      .eq('media_id', mediaId);

    if (dateRange) {
      query = query
        .gte('date', dateRange.from)
        .lte('date', dateRange.to);
    }

    const { data, error } = await query.order('date', { ascending: false });

    if (error) {
      console.error('Error fetching quality distribution:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in getQualityDistribution:', error);
    return [];
  }
}

// Main request handler
Deno.serve(async (req) => {
  // CORS headers
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const url = new URL(req.url);
    const path = url.pathname;

    // POST /media-analytics/event - Track a media event
    if (path === '/media-analytics/event' && req.method === 'POST') {
      const body = await req.json();
      const { site_id, session_id, event, metadata } = body;

      if (!site_id || !event) {
        return new Response(
          JSON.stringify({ error: 'site_id and event required' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Record metadata if provided
      if (metadata) {
        await recordMediaMetadata(supabase, site_id, metadata);
      }

      // Track the event
      const tracked = await trackMediaEvent(supabase, site_id, session_id, event);

      // Track progress points for completion analysis
      if (event.event_type === 'progress' && body.visitor_hash) {
        const progressPercent = event.duration && event.current_time
          ? Math.round((event.current_time / event.duration) * 100)
          : 0;

        // Record at 25%, 50%, 75%, 100%
        const milestones = [25, 50, 75, 100];
        for (const milestone of milestones) {
          if (Math.abs(progressPercent - milestone) < 5) {
            await recordProgressPoint(
              supabase,
              site_id,
              session_id,
              event.media_id,
              body.visitor_hash,
              milestone,
              event.current_time || 0,
              event.duration || 0
            );
          }
        }
      }

      return new Response(
        JSON.stringify({ success: tracked }),
        {
          status: tracked ? 200 : 500,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        }
      );
    }

    // GET /media-analytics/engagement - Get media engagement stats
    if (path === '/media-analytics/engagement' && req.method === 'GET') {
      const siteId = url.searchParams.get('site_id');
      const mediaId = url.searchParams.get('media_id');
      const fromDate = url.searchParams.get('from');
      const toDate = url.searchParams.get('to');

      if (!siteId) {
        return new Response(
          JSON.stringify({ error: 'site_id required' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const dateRange = (fromDate && toDate) ? { from: fromDate, to: toDate } : undefined;
      const engagement = await getMediaEngagement(supabase, siteId, mediaId || undefined, dateRange);

      return new Response(
        JSON.stringify({ data: engagement }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        }
      );
    }

    // GET /media-analytics/timeline - Get hourly performance timeline
    if (path === '/media-analytics/timeline' && req.method === 'GET') {
      const siteId = url.searchParams.get('site_id');
      const mediaId = url.searchParams.get('media_id');
      const date = url.searchParams.get('date');

      if (!siteId || !mediaId || !date) {
        return new Response(
          JSON.stringify({ error: 'site_id, media_id, and date required' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const timeline = await getMediaPerformanceTimeline(supabase, siteId, mediaId, date);

      return new Response(
        JSON.stringify({ data: timeline }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        }
      );
    }

    // GET /media-analytics/quality - Get quality distribution
    if (path === '/media-analytics/quality' && req.method === 'GET') {
      const siteId = url.searchParams.get('site_id');
      const mediaId = url.searchParams.get('media_id');
      const fromDate = url.searchParams.get('from');
      const toDate = url.searchParams.get('to');

      if (!siteId || !mediaId) {
        return new Response(
          JSON.stringify({ error: 'site_id and media_id required' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const dateRange = (fromDate && toDate) ? { from: fromDate, to: toDate } : undefined;
      const quality = await getQualityDistribution(supabase, siteId, mediaId, dateRange);

      return new Response(
        JSON.stringify({ data: quality }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Not found' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
