import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Search, RefreshCw, CheckCircle, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { Site } from '@/types/dashboard';

// Google Search Console via OAuth (read-only scope). Flow, ported from SentriSK:
//  1. Connect → Google consent screen, state = site id.
//  2. /auth/gsc-callback (GSCCallbackPage) → gsc-oauth-callback exchanges the code
//     and stores one inactive row per GSC property in site_google_credentials.
//  3. The owner picks the property that matches this site → is_active, then gsc-sync.
// The redirect URI must match gsc-oauth-callback's FRONTEND_URL + /auth/gsc-callback
// and be registered on the Google OAuth client.

const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';

// site_google_credentials is not in the generated Supabase types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const credentials = () => (supabase as unknown as { from: (table: string) => any }).from('site_google_credentials');

interface Property {
  id: string;
  property_url: string;
  is_active: boolean;
  last_sync_at: string | null;
}

function connectUrl(siteId: string) {
  const origin = import.meta.env.VITE_FRONTEND_URL || window.location.origin;
  const params = new URLSearchParams({
    client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '',
    redirect_uri: `${origin}/auth/gsc-callback`,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state: siteId,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export function GoogleSearchConsoleSetup({ selectedSite }: { selectedSite: Site }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  // Token columns are not readable from the browser; select only what the UI needs.
  const { data: properties = [], isLoading } = useQuery({
    queryKey: ['gsc-properties', selectedSite.id],
    queryFn: async () => {
      const { data, error } = await credentials()
        .select('id, property_url, is_active, last_sync_at')
        .eq('site_id', selectedSite.id)
        .order('property_url');
      if (error) throw error;
      return (data ?? []) as Property[];
    },
  });

  const active = properties.find((p) => p.is_active);
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['gsc-properties', selectedSite.id] });
    queryClient.invalidateQueries({ queryKey: ['gsc-credential', selectedSite.id] });
    queryClient.invalidateQueries({ queryKey: ['gsc-data'] });
  };

  async function sync() {
    setBusy('sync');
    const { data, error } = await supabase.functions.invoke('gsc-sync', { body: { site_id: selectedSite.id } });
    setBusy(null);
    if (error || !data?.success) {
      toast.error(`Search Console sync failed: ${data?.error ?? error?.message ?? 'unknown error'}`);
      return;
    }
    toast.success(`Synced ${data.queries} queries and ${data.pages} pages`);
    refresh();
  }

  async function activate(property: Property) {
    setBusy(property.id);
    const { error: clearError } = await credentials()
      .update({ is_active: false })
      .eq('site_id', selectedSite.id);
    const { error } = clearError
      ? { error: clearError }
      : await credentials().update({ is_active: true }).eq('id', property.id);
    setBusy(null);
    if (error) {
      toast.error('Could not select the property');
      return;
    }
    refresh();
    await sync();
  }

  const clientMissing = !import.meta.env.VITE_GOOGLE_CLIENT_ID;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Search className="h-5 w-5" />
          Google Search Console
          {active && <Badge variant="secondary" className="ml-2"><CheckCircle className="h-3 w-3 mr-1" />Connected</Badge>}
        </CardTitle>
        <CardDescription>
          Read-only access to search queries, pages, clicks, impressions and position. CortIQ never changes anything in Search Console.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {clientMissing && (
          <Alert>
            <AlertDescription>VITE_GOOGLE_CLIENT_ID is not set in this build, so the Google connection cannot start.</AlertDescription>
          </Alert>
        )}

        {!isLoading && properties.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Sign in with the Google account that has access to this site in Search Console. You choose the property afterwards.
          </p>
        )}

        {properties.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">{active ? 'Property linked to this site' : 'Choose the property for this site'}</p>
            <ul className="space-y-2">
              {properties.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-mono truncate">{p.property_url}</p>
                    {p.is_active && (
                      <p className="text-xs text-muted-foreground">
                        {p.last_sync_at ? `Last synced ${new Date(p.last_sync_at).toLocaleString()}` : 'Not synced yet'}
                      </p>
                    )}
                  </div>
                  {p.is_active ? (
                    <Button size="sm" variant="outline" onClick={sync} disabled={busy !== null}>
                      <RefreshCw className={`h-4 w-4 mr-1 ${busy === 'sync' ? 'animate-spin' : ''}`} />
                      Sync last 28 days
                    </Button>
                  ) : (
                    <Button size="sm" variant="secondary" onClick={() => activate(p)} disabled={busy !== null}>
                      Use this property
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <Button
          variant={properties.length ? 'outline' : 'default'}
          disabled={clientMissing}
          onClick={() => { window.location.href = connectUrl(selectedSite.id); }}
        >
          <Link2 className="h-4 w-4 mr-2" />
          {properties.length ? 'Reconnect Google account' : 'Connect Google Search Console'}
        </Button>
      </CardContent>
    </Card>
  );
}
