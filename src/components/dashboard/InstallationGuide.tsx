import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { ServerSideSetup } from '@/components/dashboard/ServerSideSetup';
import { buildTrackingSnippet } from '@/lib/trackingSnippet';

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
            {buildTrackingSnippet({ apiUrl: apiBase, siteId: selectedSite.id, trackingKey: selectedSite.tracking_id, scriptSrc })}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            ✅ The snippet requests the tracker only after the visitor gives analytics consent (CortIQ banner,
            Cookiebot or Google Consent Mode), so nothing — not even the file request — reaches CortIQ before that.
            Page views, sessions, AI referrals, heatmaps, click/scroll, conversions and in-browser agent signals all
            wait for consent, also with <code>cookieless: true</code> (which drops fingerprinting and persistent IDs).
            Paid-ads click IDs need marketing consent. With another CMP or GTM, load the script from its analytics
            category instead; see the integration guide.
          </p>
        </div>

        <ServerSideSetup
          siteId={selectedSite.id}
          trackingKey={selectedSite.tracking_id}
          apiBase={apiBase}
          origin={window.location.origin}
        />

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
              <li>Server-side agent measurement is on by default (plugin 5.5.0+)</li>
            </ol>
          </div>
        </div>

        <div className="p-4 bg-blue-50 rounded-md">
          <h4 className="font-semibold text-blue-900">💡 Tips</h4>
          <ul className="text-sm text-blue-800 mt-2 space-y-1">
            <li>• The script is about 13 KB gzipped and loads with <code>defer</code></li>
            <li>• Reads the visitor's stored consent choice; nothing runs in the browser before analytics consent</li>
            <li>• After analytics consent it tracks sessions, page views, clicks and scrolls; in cookieless mode without cookies or persistent IDs</li>
            <li>• Data appears in real-time on this dashboard</li>
            <li>• <strong>Paid Ads:</strong> Use UTM parameters in your ad links (e.g. ?utm_source=google&utm_medium=cpc&utm_campaign=winter2025) to attribute consented visits to campaigns without cookies</li>
          </ul>
        </div>

      </CardContent>
    </Card>
  );
}