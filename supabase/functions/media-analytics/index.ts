/**
 * Media Analytics - Video, Audio, Document Tracking
 * Task #22: Media Analytics
 *
 * Collects media events (POST only).
 *
 * The GET read endpoints (engagement, timeline, quality) were removed 2026-11-20: they returned any
 * site's data by site_id without auth and had no caller (the dashboard reads through RLS).
 */

import { createClient } from '../_shared/supabase.ts';
import { resolveSite } from '../_shared/resolve-site.ts';
import { resolveGeo, geoKey } from '../_shared/geo.ts';
import { jurisdictionGate, signalsFrom, visitorFrom } from '../_shared/jurisdiction-edge.ts';

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

// Main request handler
Deno.serve(async (req) => {
  // CORS headers
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', Allow: 'POST, OPTIONS' } }
    );
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

      // The site must exist and be active, resolved the same way as the other collectors (an account id from
      // the WordPress plugin is accepted only for a site of that account on the request's Origin).
      const site = typeof site_id === 'string' && site_id.length <= 100
        ? await resolveSite(supabase, site_id, req.headers.get('origin'), 'id, is_active')
        : null;
      if (!site || !site.is_active) {
        return new Response(
          JSON.stringify({ error: 'Invalid or inactive site' }),
          { status: 403, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
        );
      }

      // Jurisdiction (statistics): the customer's own Off drops now; opt_in and market rules stay shadow.
      // No caller in this repo sends a consent gate, so evidence comes from the ledger only.
      const drop = await jurisdictionGate(supabase, 'media-analytics', site.id, Deno.env.get('JURISDICTION_ENFORCE'), session_id).gate(async (ledger) => ({
        visitor: visitorFrom(await resolveGeo(req, { key: geoKey(), timeZone: null })), purpose: 'statistics',
        signals: signalsFrom(ledger, { trackerGate: [], gpcHeader: req.headers.get('sec-gpc') === '1' }),
        technique: { storage: 'session', identifiers: 'session' },
      }));
      if (drop) {
        return new Response(
          JSON.stringify({ success: true, skipped: 'jurisdiction' }),
          { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
        );
      }

      // Record metadata if provided
      if (metadata) {
        await recordMediaMetadata(supabase, site.id, metadata);
      }

      // Track the event
      const tracked = await trackMediaEvent(supabase, site.id, session_id, event);

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
              site.id,
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

    return new Response(
      JSON.stringify({ error: 'Not found' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: (error as Error).message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
