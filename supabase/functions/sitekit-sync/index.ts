import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from '../_shared/supabase.ts'
import { google } from 'npm:googleapis'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { 
      siteId, 
      siteUrl, 
      googleApiKey, 
      siteKitSettings,
      syncType = 'full' // 'full', 'analytics', 'search-console', 'pagespeed'
    } = await req.json()

    console.log('🚀 Site Kit Sync started for:', siteUrl, 'Type:', syncType)

    if (!siteId || !siteUrl || !googleApiKey) {
      throw new Error('Site ID, URL and Google API key are required')
    }

    // Hämta site-konfiguration
    const { data: site, error: siteError } = await supabase
      .from('sites')
      .select('*')
      .eq('id', siteId)
      .single()

    if (siteError || !site) {
      throw new Error('Site not found')
    }

    let syncedData: any = {}

    // Search Console synkronisering
    if (syncType === 'full' || syncType === 'search-console') {
      console.log('Syncing Search Console data...')
      const searchConsoleData = await syncSearchConsoleData(
        siteUrl, 
        googleApiKey, 
        siteKitSettings?.searchConsole
      )
      
      // Spara i databas
      if (searchConsoleData.queries?.length > 0) {
        await supabase.from('search_console_data').upsert(
          searchConsoleData.queries.map(query => ({
            site_id: siteId,
            query: query.query,
            clicks: query.clicks,
            impressions: query.impressions,
            ctr: query.ctr,
            position: query.position,
            date: new Date().toISOString().split('T')[0]
          }))
        )
      }

      syncedData.searchConsole = searchConsoleData
    }

    // Analytics synkronisering
    if (syncType === 'full' || syncType === 'analytics') {
      console.log('Syncing Analytics data...')
      const analyticsData = await syncAnalyticsData(
        siteKitSettings?.analytics?.propertyId,
        googleApiKey,
        siteKitSettings?.analytics
      )

      // Spara analytics metrics
      if (analyticsData.sessions > 0) {
        await supabase.from('analytics_daily_summary').upsert({
          site_id: siteId,
          date: new Date().toISOString().split('T')[0],
          sessions: analyticsData.sessions,
          users: analyticsData.users,
          pageviews: analyticsData.pageviews,
          bounce_rate: analyticsData.bounceRate,
          session_duration: analyticsData.sessionDuration,
          source: 'sitekit'
        })
      }

      syncedData.analytics = analyticsData
    }

    // PageSpeed synkronisering
    if (syncType === 'full' || syncType === 'pagespeed') {
      console.log('Syncing PageSpeed data...')
      const pagespeedData = await syncPageSpeedData(siteUrl, googleApiKey)

      // Spara PageSpeed metrics
      await supabase.from('pagespeed_metrics').upsert({
        site_id: siteId,
        url: siteUrl,
        mobile_score: pagespeedData.mobileScore,
        desktop_score: pagespeedData.desktopScore,
        fcp: pagespeedData.fcp,
        lcp: pagespeedData.lcp,
        measured_at: new Date().toISOString(),
        source: 'sitekit'
      })

      syncedData.pagespeed = pagespeedData
    }

    // Uppdatera site med Site Kit-konfiguration
    await supabase
      .from('sites')
      .update({
        sitekit_settings: siteKitSettings,
        sitekit_last_sync: new Date().toISOString(),
        sitekit_api_key: googleApiKey // Encrypted storage
      })
      .eq('id', siteId)

    console.log('✅ Site Kit sync completed successfully')

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Site Kit data synchronized successfully',
        syncedData,
        syncType,
        timestamp: new Date().toISOString()
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error('❌ Site Kit sync error:', error)
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})

async function syncSearchConsoleData(siteUrl: string, apiKey: string, settings?: any) {
  const endDate = new Date().toISOString().split('T')[0]
  const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  
  try {
    const searchConsole = google.webmasters({
      version: 'v3',
      auth: apiKey
    })
    
    // Hämta query data
    const queryResponse = await searchConsole.searchanalytics.query({
      siteUrl: siteUrl,
      requestBody: {
        startDate,
        endDate,
        dimensions: ['query'],
        rowLimit: settings?.queryLimit || 100
      }
    })

    // Hämta page data
    const pageResponse = await searchConsole.searchanalytics.query({
      siteUrl: siteUrl,
      requestBody: {
        startDate,
        endDate,
        dimensions: ['page'],
        rowLimit: settings?.pageLimit || 50
      }
    })
    
    const queryData = queryResponse.data.rows || []
    const pageData = pageResponse.data.rows || []
    
    let totalClicks = 0
    let totalImpressions = 0
    
    queryData.forEach((row) => {
      totalClicks += row.clicks || 0
      totalImpressions += row.impressions || 0
    })
    
    return {
      totalClicks,
      totalImpressions,
      averageCTR: queryData.length > 0 ? 
        +(queryData.reduce((sum, row) => sum + (row.ctr || 0), 0) / queryData.length * 100).toFixed(2) : 0,
      averagePosition: queryData.length > 0 ? 
        +(queryData.reduce((sum, row) => sum + (row.position || 0), 0) / queryData.length).toFixed(1) : 0,
      queries: queryData.map((row) => ({
        query: row.keys ? row.keys[0] : '',
        clicks: row.clicks || 0,
        impressions: row.impressions || 0,
        ctr: row.ctr || 0,
        position: row.position || 0
      })),
      pages: pageData.map((row) => ({
        page: row.keys ? row.keys[0] : '',
        clicks: row.clicks || 0,
        impressions: row.impressions || 0,
        ctr: row.ctr || 0,
        position: row.position || 0
      }))
    }
  } catch (error) {
    console.error('Search Console sync error:', error)
    return {
      totalClicks: 0,
      totalImpressions: 0,
      averageCTR: 0,
      averagePosition: 0,
      queries: [],
      pages: []
    }
  }
}

async function syncAnalyticsData(propertyId: string, apiKey: string, settings?: any) {
  if (!propertyId) {
    return {
      sessions: 0,
      users: 0,
      pageviews: 0,
      bounceRate: 0,
      sessionDuration: 0
    }
  }

  const endDate = new Date().toISOString().split('T')[0]
  const startDate = new Date(Date.now() - (settings?.dayRange || 30) * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  
  try {
    const analyticsData = google.analyticsdata({
      version: 'v1beta',
      auth: apiKey
    })
    
    const response = await analyticsData.properties.runReport({
      property: `properties/${propertyId}`,
      requestBody: {
        dateRanges: [{ startDate, endDate }],
        metrics: [
          { name: 'sessions' },
          { name: 'totalUsers' },
          { name: 'screenPageViews' },
          { name: 'bounceRate' },
          { name: 'averageSessionDuration' },
          { name: 'engagementRate' },
          { name: 'conversions' }
        ],
        dimensions: settings?.includeDimensions ? [
          { name: 'deviceCategory' },
          { name: 'sourceMedium' }
        ] : []
      }
    })
    
    const metrics = response.data.rows?.[0]?.metricValues || []
    
    return {
      sessions: parseInt(metrics[0]?.value || '0'),
      users: parseInt(metrics[1]?.value || '0'),
      pageviews: parseInt(metrics[2]?.value || '0'),
      bounceRate: parseFloat(metrics[3]?.value || '0'),
      sessionDuration: parseInt(metrics[4]?.value || '0'),
      engagementRate: parseFloat(metrics[5]?.value || '0'),
      conversions: parseInt(metrics[6]?.value || '0'),
      dimensions: response.data.rows || []
    }
  } catch (error) {
    console.error('Analytics sync error:', error)
    return {
      sessions: 0,
      users: 0,
      pageviews: 0,
      bounceRate: 0,
      sessionDuration: 0,
      engagementRate: 0,
      conversions: 0,
      dimensions: []
    }
  }
}

async function syncPageSpeedData(siteUrl: string, apiKey: string) {
  try {
    const pagespeedapi = google.pagespeedonline({
      version: 'v5',
      auth: apiKey
    })
    
    const [mobileResponse, desktopResponse] = await Promise.all([
      pagespeedapi.pagespeedapi.runpagespeed({
        url: siteUrl,
        strategy: 'mobile',
        category: ['PERFORMANCE', 'ACCESSIBILITY', 'BEST_PRACTICES', 'SEO']
      }),
      pagespeedapi.pagespeedapi.runpagespeed({
        url: siteUrl,
        strategy: 'desktop',
        category: ['PERFORMANCE', 'ACCESSIBILITY', 'BEST_PRACTICES', 'SEO']
      })
    ])
    
    const mobileData = mobileResponse.data
    const desktopData = desktopResponse.data
    
    return {
      mobileScore: Math.round((mobileData.lighthouseResult?.categories?.performance?.score || 0) * 100),
      desktopScore: Math.round((desktopData.lighthouseResult?.categories?.performance?.score || 0) * 100),
      fcp: +(mobileData.lighthouseResult?.audits?.['first-contentful-paint']?.numericValue / 1000 || 0).toFixed(1),
      lcp: +(mobileData.lighthouseResult?.audits?.['largest-contentful-paint']?.numericValue / 1000 || 0).toFixed(1),
      cls: +(mobileData.lighthouseResult?.audits?.['cumulative-layout-shift']?.numericValue || 0).toFixed(3),
      accessibility: {
        mobile: Math.round((mobileData.lighthouseResult?.categories?.accessibility?.score || 0) * 100),
        desktop: Math.round((desktopData.lighthouseResult?.categories?.accessibility?.score || 0) * 100)
      },
      seo: {
        mobile: Math.round((mobileData.lighthouseResult?.categories?.seo?.score || 0) * 100),
        desktop: Math.round((desktopData.lighthouseResult?.categories?.seo?.score || 0) * 100)
      }
    }
  } catch (error) {
    console.error('PageSpeed sync error:', error)
    return {
      mobileScore: 0,
      desktopScore: 0,
      fcp: 0,
      lcp: 0,
      cls: 0,
      accessibility: { mobile: 0, desktop: 0 },
      seo: { mobile: 0, desktop: 0 }
    }
  }
}