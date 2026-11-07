import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Search, RefreshCw, CheckCircle, Link2, History, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { Site } from '@/types/dashboard';

// Google Search Console via OAuth (read-only scope). Flow, ported from SentriSK:
//  1. Connect → Google consent screen, state = site id.
//  2. /auth/gsc-callback (GSCCallbackPage) → gsc-oauth-callback exchanges the code
//     and stores one inactive row per GSC property in site_google_credentials.
//     Or, for a further site: pick a property already connected for another of the
//     owner's sites → gsc-link-property copies that connection server-side.
//  3. The owner picks the property that matches this site → is_active, then gsc-sync
//     (a site's first sync loads 16 months). The gsc-daily-sync cron job re-syncs the
//     current and previous month every day.
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

// sc-domain:example.com and https://www.example.com/ both belong to example.com.
const bareHost = (value: string) =>
  value.replace(/^sc-domain:/, '').replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '').toLowerCase();

const propertyKind = (url: string) =>
  url.startsWith('sc-domain:')
    ? 'Domain property: all subdomains, http and https'
    : 'URL-prefix property: only URLs under this exact address';

function Step({ n, done, title, children }: { n: number; done: boolean; title: string; children?: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
          done ? 'bg-primary text-primary-foreground' : 'border text-muted-foreground'
        }`}
      >
        {done ? <CheckCircle className="h-3.5 w-3.5" /> : n}
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-sm font-medium">{title}</p>
        {children}
      </div>
    </li>
  );
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

  // Properties the owner's Google connection already reaches through their other sites
  // (RLS limits rows to the owner's sites).
  const { data: elsewhere = [] } = useQuery({
    queryKey: ['gsc-properties-elsewhere', selectedSite.id],
    queryFn: async () => {
      const { data, error } = await credentials()
        .select('property_url')
        .neq('site_id', selectedSite.id);
      if (error) throw error;
      return [...new Set(((data ?? []) as { property_url: string }[]).map((r) => r.property_url))].sort();
    },
  });

  const active = properties.find((p) => p.is_active);
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['gsc-properties', selectedSite.id] });
    queryClient.invalidateQueries({ queryKey: ['gsc-properties-elsewhere', selectedSite.id] });
    queryClient.invalidateQueries({ queryKey: ['gsc-credential', selectedSite.id] });
    queryClient.invalidateQueries({ queryKey: ['gsc-data'] });
    queryClient.invalidateQueries({ queryKey: ['gsc-monthly', selectedSite.id] });
  };

  async function sync(history = false) {
    setBusy(history ? 'history' : 'sync');
    const { data, error } = await supabase.functions.invoke('gsc-sync', { body: { site_id: selectedSite.id, history } });
    setBusy(null);
    if (error || !data?.success) {
      toast.error(`Search Console sync failed: ${data?.error ?? error?.message ?? 'unknown error'}`);
      return;
    }
    toast.success(`Synced ${data.months} month${data.months === 1 ? '' : 's'} (${data.from} – ${data.to})`);
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

  async function linkExisting(propertyUrl: string) {
    setBusy(propertyUrl);
    const { data, error } = await supabase.functions.invoke('gsc-link-property', {
      body: { site_id: selectedSite.id, property_url: propertyUrl },
    });
    setBusy(null);
    if (error || !data?.success) {
      toast.error(`Could not use the property: ${data?.error ?? error?.message ?? 'unknown error'}`);
      return;
    }
    refresh();
    await sync();
  }

  const clientMissing = !import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const connected = properties.length > 0;
  const siteHost = bareHost(selectedSite.domain ?? '');
  const matches = (p: Property) => !!siteHost && bareHost(p.property_url) === siteHost;
  // Prefer a matching Domain property, then a matching URL-prefix property.
  const suggested = properties.find((p) => matches(p) && p.property_url.startsWith('sc-domain:')) ?? properties.find(matches);
  const ownUrls = new Set(properties.map((p) => p.property_url));
  const reusable = elsewhere.filter((url) => !ownUrls.has(url));
  const matchesUrl = (url: string) => !!siteHost && bareHost(url) === siteHost;
  const reusableSuggested = reusable.find((u) => matchesUrl(u) && u.startsWith('sc-domain:')) ?? reusable.find(matchesUrl);
  const reusableSorted = reusableSuggested ? [reusableSuggested, ...reusable.filter((u) => u !== reusableSuggested)] : reusable;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Search className="h-5 w-5" />
          Google Search Console
          {active && <Badge variant="secondary" className="ml-2"><CheckCircle className="h-3 w-3 mr-1" />Connected</Badge>}
        </CardTitle>
        <CardDescription>
          Shows which Google searches bring people to this site: queries, pages, clicks, impressions and average position.
          Read-only access. CortIQ never changes anything in Search Console.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {clientMissing && (
          <Alert>
            <AlertDescription>VITE_GOOGLE_CLIENT_ID is not set in this build, so the Google connection cannot start.</AlertDescription>
          </Alert>
        )}

        <ol className="space-y-4">
          <Step n={1} done={connected} title="Have the site verified in Search Console">
            {!connected && (
              <p className="text-sm text-muted-foreground">
                Skip this if {selectedSite.domain || 'the site'} is already in your Search Console. Otherwise add it there first.
                A Domain property is easiest: it covers all subdomains and both http and https.{' '}
                <a
                  href="https://search.google.com/search-console"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 underline"
                >
                  Open Search Console <ExternalLink className="h-3 w-3" />
                </a>
              </p>
            )}
          </Step>

          <Step n={2} done={connected} title="Connect the Google account that has access">
            <Button
              size="sm"
              variant={connected ? 'outline' : 'default'}
              disabled={clientMissing}
              onClick={() => { window.location.href = connectUrl(selectedSite.id); }}
            >
              <Link2 className="h-4 w-4 mr-2" />
              {connected ? 'Reconnect Google account' : 'Connect Google Search Console'}
            </Button>
            {!connected && reusable.length > 0 && (
              <p className="text-sm text-muted-foreground">
                Already connected Google for another site? Skip this and pick a property from that connection in step 3.
              </p>
            )}
          </Step>

          <Step n={3} done={!!active} title="Choose the property for this site">
            {!connected ? (
              !isLoading && reusable.length === 0 && (
                <p className="text-sm text-muted-foreground">The properties your Google account can read appear here after step 2.</p>
              )
            ) : (
              <>
                {!active && !suggested && !reusableSuggested && siteHost && (
                  <p className="text-sm text-muted-foreground">
                    No property matches {selectedSite.domain}. Add the site in Search Console, then reconnect.
                  </p>
                )}
                <ul className="space-y-2">
                  {properties.map((p) => (
                    <li
                      key={p.id}
                      className={`flex items-center justify-between gap-3 rounded-md border p-3 text-sm ${p.is_active ? 'border-primary' : ''}`}
                    >
                      <div className="min-w-0">
                        <p className="font-mono truncate">{p.property_url}</p>
                        <p className="text-xs text-muted-foreground">
                          {propertyKind(p.property_url)}
                          {!active && p.id === suggested?.id && ' · matches this site'}
                        </p>
                      </div>
                      {p.is_active ? (
                        <Badge variant="secondary">In use</Badge>
                      ) : (
                        <Button
                          size="sm"
                          variant={!active && p.id === suggested?.id ? 'default' : 'secondary'}
                          onClick={() => activate(p)}
                          disabled={busy !== null}
                        >
                          Use this property
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {!active && reusable.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  From the Google connection on your other sites. CortIQ reuses that connection, so no new Google sign-in is needed.
                </p>
                <ul className="space-y-2">
                  {reusableSorted.map((url) => (
                    <li key={url} className="flex items-center justify-between gap-3 rounded-md border border-dashed p-3 text-sm">
                      <div className="min-w-0">
                        <p className="font-mono truncate">{url}</p>
                        <p className="text-xs text-muted-foreground">
                          {propertyKind(url)}
                          {url === reusableSuggested && ' · matches this site'}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant={url === reusableSuggested && !suggested ? 'default' : 'secondary'}
                        onClick={() => linkExisting(url)}
                        disabled={busy !== null}
                      >
                        Use this property
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Step>

          <Step n={4} done={!!active?.last_sync_at} title="Data syncs automatically every day">
            {active && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {active.last_sync_at ? `Last synced ${new Date(active.last_sync_at).toLocaleString()}.` : 'Not synced yet.'}{' '}
                  Every night CortIQ refreshes the current and previous month. The first sync loads 16 months, which is as far back
                  as Search Console keeps data. Google publishes the data with a delay of about two days.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => sync(false)} disabled={busy !== null}>
                    <RefreshCw className={`h-4 w-4 mr-1 ${busy === 'sync' ? 'animate-spin' : ''}`} />
                    Sync now
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => sync(true)} disabled={busy !== null}>
                    <History className={`h-4 w-4 mr-1 ${busy === 'history' ? 'animate-spin' : ''}`} />
                    Load 16 months
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  Where the data shows up: Acquisition → Google Search (queries, pages, monthly trend), AI agents → Zero-click risk,
                  and AI agents → GEO / AI search (AI Overviews data, where Google provides it).
                </p>
              </div>
            )}
          </Step>
        </ol>
      </CardContent>
    </Card>
  );
}
