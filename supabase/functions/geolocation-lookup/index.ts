/**
 * Geolocation Lookup and Analysis
 * Task #17: Avancerad Geolokalisering med Karta
 *
 * Provides geolocation data lookup for GeoIP integration
 * Supports country, region, and city level data
 */

import { createClient } from '../_shared/supabase.ts';

const GEOLOCATION_API = 'https://geoip-api.com/api/geoip/';

interface GeolocationData {
  country_code: string;
  country_name: string;
  region_code: string;
  region_name: string;
  city_name: string;
  latitude: number;
  longitude: number;
  timezone: string;
  accuracy_radius?: number;
}

interface ClusterRequest {
  site_id: string;
  date: string;
  zoom_level: number;
}

interface AggregateRequest {
  site_id: string;
  date: string;
  level: 'country' | 'region' | 'city';
  country_code?: string;
  region_code?: string;
}

// Lookup geolocation for an IP address using GeoIP2
async function lookupGeoIP(ip: string): Promise<GeolocationData | null> {
  try {
    // Use MaxMind GeoIP2 API or similar service
    // This is a mock implementation - replace with actual GeoIP2 API
    const response = await fetch(`${GEOLOCATION_API}${ip}`, {
      headers: {
        'Authorization': `Bearer ${Deno.env.get('GEOIP_API_KEY')}`
      }
    });

    if (!response.ok) return null;

    const data = await response.json();

    return {
      country_code: data.country_iso_code || 'XX',
      country_name: data.country_name || 'Unknown',
      region_code: data.subdivisions?.[0]?.iso_code || '',
      region_name: data.subdivisions?.[0]?.name || '',
      city_name: data.city?.name || '',
      latitude: data.latitude || 0,
      longitude: data.longitude || 0,
      timezone: data.time_zone || 'UTC',
      accuracy_radius: data.location?.accuracy_radius
    };
  } catch (error) {
    console.error('GeoIP lookup error:', error);
    return null;
  }
}

// Get aggregated geolocation stats
async function getGeolocationStats(
  supabase: any,
  request: AggregateRequest
): Promise<any[]> {
  let query = supabase
    .from('geolocation_aggregates')
    .select('*')
    .eq('site_id', request.site_id)
    .eq('date', request.date);

  if (request.level === 'country') {
    query = query.order('sessions', { ascending: false });
  } else if (request.level === 'region' && request.country_code) {
    query = query.eq('country_code', request.country_code);
  } else if (request.level === 'city' && request.country_code && request.region_code) {
    query = query
      .eq('country_code', request.country_code)
      .eq('region_code', request.region_code);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching geolocation stats:', error);
    return [];
  }

  return data || [];
}

// Get clustered geolocation data for map rendering
async function getGeolocationClusters(
  supabase: any,
  request: ClusterRequest
): Promise<any[]> {
  const { data, error } = await supabase
    .from('geolocation_clusters')
    .select('*')
    .eq('site_id', request.site_id)
    .eq('date', request.date)
    .eq('zoom_level', request.zoom_level)
    .order('sessions', { ascending: false });

  if (error) {
    console.error('Error fetching clusters:', error);
    return [];
  }

  return data || [];
}

// Get geoheatmap density points
async function getGeoheatmapDensity(
  supabase: any,
  siteId: string,
  date: string
): Promise<any[]> {
  const { data, error } = await supabase
    .from('geoheatmap_density')
    .select('*')
    .eq('site_id', siteId)
    .eq('date', date)
    .order('intensity', { ascending: false })
    .limit(5000); // Limit for performance

  if (error) {
    console.error('Error fetching heatmap density:', error);
    return [];
  }

  return data || [];
}

// Get geographic hierarchy for drill-down
async function getGeographicHierarchy(
  supabase: any,
  countryCode?: string,
  regionCode?: string
): Promise<any[]> {
  let query = supabase
    .from('geolocation_hierarchy')
    .select('*');

  if (countryCode) {
    query = query.eq('country_code', countryCode);
  }

  if (regionCode && countryCode) {
    query = query.eq('region_code', regionCode);
  }

  const { data, error } = await query.order('level', { ascending: true });

  if (error) {
    console.error('Error fetching hierarchy:', error);
    return [];
  }

  return data || [];
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

    // POST /geolocation-lookup/geoip - Lookup IP address geolocation
    if (path === '/geolocation-lookup/geoip' && req.method === 'POST') {
      const body = await req.json();
      const { ip } = body;

      if (!ip) {
        return new Response(
          JSON.stringify({ error: 'IP address required' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const geoData = await lookupGeoIP(ip);

      return new Response(
        JSON.stringify({ data: geoData }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        }
      );
    }

    // GET /geolocation-lookup/stats - Get aggregated geolocation statistics
    if (path === '/geolocation-lookup/stats' && req.method === 'GET') {
      const siteId = url.searchParams.get('site_id');
      const date = url.searchParams.get('date');
      const level = (url.searchParams.get('level') || 'country') as 'country' | 'region' | 'city';
      const countryCode = url.searchParams.get('country_code');
      const regionCode = url.searchParams.get('region_code');

      if (!siteId || !date) {
        return new Response(
          JSON.stringify({ error: 'site_id and date required' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const stats = await getGeolocationStats(supabase, {
        site_id: siteId,
        date,
        level,
        country_code: countryCode || undefined,
        region_code: regionCode || undefined
      });

      return new Response(
        JSON.stringify({ data: stats }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        }
      );
    }

    // GET /geolocation-lookup/clusters - Get clustered geolocation data for map
    if (path === '/geolocation-lookup/clusters' && req.method === 'GET') {
      const siteId = url.searchParams.get('site_id');
      const date = url.searchParams.get('date');
      const zoomLevel = parseInt(url.searchParams.get('zoom_level') || '3');

      if (!siteId || !date) {
        return new Response(
          JSON.stringify({ error: 'site_id and date required' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const clusters = await getGeolocationClusters(supabase, {
        site_id: siteId,
        date,
        zoom_level: zoomLevel
      });

      return new Response(
        JSON.stringify({ data: clusters }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        }
      );
    }

    // GET /geolocation-lookup/heatmap - Get geoheatmap density data
    if (path === '/geolocation-lookup/heatmap' && req.method === 'GET') {
      const siteId = url.searchParams.get('site_id');
      const date = url.searchParams.get('date');

      if (!siteId || !date) {
        return new Response(
          JSON.stringify({ error: 'site_id and date required' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const heatmapData = await getGeoheatmapDensity(supabase, siteId, date);

      return new Response(
        JSON.stringify({ data: heatmapData }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        }
      );
    }

    // GET /geolocation-lookup/hierarchy - Get geographic hierarchy
    if (path === '/geolocation-lookup/hierarchy' && req.method === 'GET') {
      const countryCode = url.searchParams.get('country_code');
      const regionCode = url.searchParams.get('region_code');

      const hierarchy = await getGeographicHierarchy(
        supabase,
        countryCode || undefined,
        regionCode || undefined
      );

      return new Response(
        JSON.stringify({ data: hierarchy }),
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
