import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface LogEntry {
  timestamp: Date
  ip: string
  method: string
  url: string
  status: number
  referrer?: string
  userAgent?: string
  loadTime?: number
}

// Parse Combined Log Format (Apache/Nginx standard)
// 93.184.216.34 - - [10/Jan/2025:13:55:36 +0000] "GET /produkter HTTP/1.1" 200 1234 "https://google.com" "Mozilla/5.0..."
function parseCombinedLogFormat(line: string): LogEntry | null {
  const regex = /^(\S+) \S+ \S+ \[([^\]]+)\] "(\S+) (\S+) \S+" (\d+) \S+ "([^"]*)" "([^"]*)"/
  const match = line.match(regex)
  
  if (!match) return null
  
  const [, ip, timestamp, method, url, status, referrer, userAgent] = match
  
  return {
    timestamp: new Date(timestamp.replace(/(\d+)\/(\w+)\/(\d+):/, '$3-$2-$1T')),
    ip,
    method,
    url,
    status: parseInt(status),
    referrer: referrer !== '-' ? referrer : undefined,
    userAgent: userAgent !== '-' ? userAgent : undefined
  }
}

// Parse JSON log format
function parseJsonLog(line: string): LogEntry | null {
  try {
    const log = JSON.parse(line)
    return {
      timestamp: new Date(log.timestamp),
      ip: log.ip,
      method: log.method,
      url: log.url,
      status: log.status,
      referrer: log.referrer,
      userAgent: log.user_agent || log.userAgent,
      loadTime: log.load_time || log.loadTime
    }
  } catch {
    return null
  }
}

// Parse CSV log format
function parseCsvLog(line: string, isFirstLine: boolean): LogEntry | null {
  if (isFirstLine) return null // Skip header
  
  const parts = line.split(',')
  if (parts.length < 5) return null
  
  return {
    timestamp: new Date(parts[0]),
    ip: parts[1],
    method: parts[2],
    url: parts[3],
    status: parseInt(parts[4]),
    referrer: parts[5] || undefined,
    userAgent: parts[6] || undefined
  }
}

// Anonymize IP address to country code
function anonymizeIpToCountry(ip: string): string {
  // In production, use a GeoIP service or database
  // For now, we'll use a simple heuristic based on IP ranges
  // This is a simplified example - replace with proper GeoIP lookup
  
  const parts = ip.split('.')
  if (parts.length !== 4) return 'XX' // Unknown
  
  const firstOctet = parseInt(parts[0])
  
  // Simplified country detection (replace with real GeoIP service)
  if (firstOctet >= 80 && firstOctet <= 90) return 'SE' // Sweden
  if (firstOctet >= 91 && firstOctet <= 95) return 'NO' // Norway
  if (firstOctet >= 77 && firstOctet <= 79) return 'DK' // Denmark
  if (firstOctet >= 46 && firstOctet <= 51) return 'UK' // UK
  if (firstOctet >= 5 && firstOctet <= 38) return 'US' // US
  
  return 'XX' // Unknown
}

// Extract device type from User-Agent
function getDeviceType(userAgent?: string): string {
  if (!userAgent) return 'unknown'
  
  const ua = userAgent.toLowerCase()
  if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) return 'mobile'
  if (ua.includes('tablet') || ua.includes('ipad')) return 'tablet'
  return 'desktop'
}

// Extract browser from User-Agent
function getBrowser(userAgent?: string): string {
  if (!userAgent) return 'unknown'
  
  const ua = userAgent.toLowerCase()
  if (ua.includes('chrome') && !ua.includes('edge')) return 'Chrome'
  if (ua.includes('firefox')) return 'Firefox'
  if (ua.includes('safari') && !ua.includes('chrome')) return 'Safari'
  if (ua.includes('edge')) return 'Edge'
  if (ua.includes('opera')) return 'Opera'
  return 'Other'
}

// Extract domain from referrer URL
function getReferrerDomain(referrer?: string): string | null {
  if (!referrer || referrer === '-') return null
  
  try {
    const url = new URL(referrer)
    return url.hostname
  } catch {
    return null
  }
}

// Check if request is from a bot
function isBot(userAgent?: string): boolean {
  if (!userAgent) return false
  
  const ua = userAgent.toLowerCase()
  const botPatterns = ['bot', 'crawler', 'spider', 'scraper', 'curl', 'wget', 'python-requests']
  return botPatterns.some(pattern => ua.includes(pattern))
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { site_id, log_content, log_format } = await req.json()

    if (!site_id || !log_content || !log_format) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: site_id, log_content, log_format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // AuthZ: verify_jwt only proves *someone* is logged in. Confirm the caller owns
    // this site via an RLS-scoped read before the service-role client writes into it
    // (otherwise any account could inject log aggregates into another tenant's site).
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } }
    )
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const { data: ownedSite } = await userClient
      .from('sites')
      .select('id')
      .eq('id', site_id)
      .maybeSingle()
    if (!ownedSite) {
      return new Response(JSON.stringify({ error: 'Site not found or access denied' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Validate log format
    if (!['combined', 'json', 'csv'].includes(log_format)) {
      return new Response(
        JSON.stringify({ error: 'Invalid log_format. Must be: combined, json, or csv' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create import record
    const { data: importRecord, error: importError } = await supabase
      .from('server_log_imports')
      .insert({
        site_id,
        filename: `import_${new Date().toISOString()}`,
        log_format,
        status: 'processing'
      })
      .select()
      .single()

    if (importError) {
      console.error('Failed to create import record:', importError)
      return new Response(
        JSON.stringify({ error: 'Failed to create import record' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse logs line by line
    const lines = log_content.split('\n').filter((line: string) => line.trim())
    let processedLines = 0
    let failedLines = 0

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      
      let logEntry: LogEntry | null = null
      
      // Parse based on format
      if (log_format === 'combined') {
        logEntry = parseCombinedLogFormat(line)
      } else if (log_format === 'json') {
        logEntry = parseJsonLog(line)
      } else if (log_format === 'csv') {
        logEntry = parseCsvLog(line, i === 0)
      }

      if (!logEntry) {
        failedLines++
        continue
      }

      // Skip bot traffic (optional - you can track bots separately)
      if (isBot(logEntry.userAgent)) {
        processedLines++
        continue
      }

      // Anonymize IP immediately (IP → Country → Delete IP)
      const countryCode = anonymizeIpToCountry(logEntry.ip)
      // IP is NOT stored - only country code
      
      const deviceType = getDeviceType(logEntry.userAgent)
      const browser = getBrowser(logEntry.userAgent)
      const referrerDomain = getReferrerDomain(logEntry.referrer)

      // Call database function to aggregate data
      const { error: aggregateError } = await supabase.rpc('increment_server_log_analytics', {
        p_site_id: site_id,
        p_date: logEntry.timestamp.toISOString().split('T')[0],
        p_url: logEntry.url,
        p_device_type: deviceType,
        p_browser: browser,
        p_country_code: countryCode,
        p_referrer_domain: referrerDomain,
        p_load_time_ms: logEntry.loadTime || 0,
        p_status_code: logEntry.status
      })

      if (aggregateError) {
        console.error('Failed to aggregate log entry:', aggregateError)
        failedLines++
      } else {
        processedLines++
      }
    }

    // Update import record
    await supabase
      .from('server_log_imports')
      .update({
        total_lines: lines.length,
        processed_lines: processedLines,
        failed_lines: failedLines,
        status: failedLines === lines.length ? 'failed' : 'completed',
        completed_at: new Date().toISOString()
      })
      .eq('id', importRecord.id)

    return new Response(
      JSON.stringify({
        success: true,
        import_id: importRecord.id,
        stats: {
          total_lines: lines.length,
          processed_lines: processedLines,
          failed_lines: failedLines
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Import server logs error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
