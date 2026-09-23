import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

interface Site {
  id: string;
  site_name: string;
  domain: string;
  tracking_id: string;
  is_active: boolean;
  created_at: string;
}

interface InstallationGuideProps {
  selectedSite: Site | null;
}

export function InstallationGuide({ selectedSite }: InstallationGuideProps) {
  // Derive endpoints from THIS deployment's env/origin so the copied snippet points at
  // the instance the user actually runs. Hardcoding cortiq.se / the origin Supabase would
  // pipe a self-hoster's visitor data into the origin project — never hardcode these.
  const apiBase = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
  const scriptSrc = `${window.location.origin}/spa-tracking.js`;

  if (!selectedSite) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>🚀 Installation</CardTitle>
          <CardDescription>Add the tracking script to your website</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-yellow-50 rounded-md text-center">
            <h4 className="font-semibold text-yellow-900">⚠️ No website selected</h4>
            <p className="text-sm text-yellow-800 mt-2">
              Select or add a website to see installation instructions.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>🚀 Installation</CardTitle>
        <CardDescription>Add the tracking script to your website</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Tracking snippet (Recommended)</Label>
          <div className="bg-muted text-foreground p-4 rounded-md font-mono text-xs mt-2 overflow-x-auto whitespace-pre-wrap break-all">
            {`<!-- CortIQ Analytics -->
<script>
  window.cortiqConfig = {
    apiUrl: '${apiBase}',
    siteId: '${selectedSite.id}',
    apiKey: '${selectedSite.tracking_id}',
    contentType: 'page',
    platform: 'web',
    cookieless: true
  };
</script>
<script src="${scriptSrc}" defer></script>`}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            ✅ One script. AI bot detection (GPTBot, ClaudeBot, PerplexityBot) runs
            without consent as a security layer. All visitor analytics — page views, sessions, AI referrals
            (ChatGPT, Perplexity, Claude, Gemini), heatmaps, click/scroll, conversions — start only after analytics consent, also with
            <code>cookieless: true</code> (which drops fingerprinting and persistent IDs). Paid-ads click IDs need
            marketing consent. The script reads <code>window.cortiqConfig</code>,
            so keep it directly above the script tag.
          </p>
        </div>

        <div>
          <Label>WordPress Plugin</Label>
          <div className="space-y-2 mt-2">
            <p className="text-sm text-muted-foreground">
              For WordPress websites you can use our plugin which automatically adds the tracking code.
            </p>
            <ol className="text-sm space-y-1 list-decimal list-inside">
              <li>Download the plugin from above</li>
              <li>Install the plugin on your WordPress website</li>
              <li>Go to Settings → CortIQ</li>
              <li>Enter your Site ID: <code className="bg-muted text-foreground px-1 rounded">{selectedSite.id}</code></li>
              <li>Enter your Tracking ID: <code className="bg-muted text-foreground px-1 rounded">{selectedSite.tracking_id}</code></li>
              <li>Enable GDPR compatibility if needed</li>
            </ol>
          </div>
        </div>

        <div className="p-4 bg-blue-50 rounded-md">
          <h4 className="font-semibold text-blue-900">💡 Tips</h4>
          <ul className="text-sm text-blue-800 mt-2 space-y-1">
            <li>• The script is only ~15KB and does not affect performance</li>
            <li>• GDPR-compliant with automatic consent handling</li>
            <li>• Tracks clicks, scrolls, and sessions anonymously</li>
            <li>• Data appears in real-time on this dashboard</li>
            <li>• <strong>Paid Ads:</strong> Use UTM parameters in your ad links (e.g. ?utm_source=google&utm_medium=cpc&utm_campaign=winter2025) to track campaign performance cookie-free!</li>
          </ul>
        </div>

      </CardContent>
    </Card>
  );
}