import { useState, type ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, CheckCircle, Loader2, RefreshCw, Unplug } from 'lucide-react';
import { toast } from 'sonner';
import { formatCustomerId, googleAdsOAuth, useGoogleAdsConnection } from '@/hooks/useGoogleAdsConnection';

interface GoogleAdsConnectCardProps {
  siteId: string;
}

/**
 * Settings → Integrations → Google Ads. Sign in with Google (adwords scope, offline access),
 * pick the account this site reports on, disconnect. Used by Click fraud, Paid ads and the
 * Enhanced Conversions upload. No developer token or client secret is entered here: those are
 * set once on the CortIQ instance.
 */
export function GoogleAdsConnectCard({ siteId }: GoogleAdsConnectCardProps) {
  const { connection, isLoading, ready, refresh } = useGoogleAdsConnection(siteId);
  const [busy, setBusy] = useState<null | 'connect' | 'select' | 'accounts' | 'disconnect'>(null);

  const run = async (kind: NonNullable<typeof busy>, fn: () => Promise<void>) => {
    setBusy(kind);
    try {
      await fn();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Google Ads request failed');
    } finally {
      setBusy(null);
    }
  };

  const connect = () => run('connect', async () => {
    const { url } = await googleAdsOAuth<{ url: string }>('authorize', { site_id: siteId });
    // Remember which site started the flow so the callback page can return to it.
    try { sessionStorage.setItem('cortiq_google_ads_site', siteId); } catch { /* optional */ }
    window.location.assign(url);
  });

  const select = (customerId: string) => run('select', async () => {
    await googleAdsOAuth('select_customer', { site_id: siteId, customer_id: customerId });
    toast.success('Google Ads account selected');
    refresh();
  });

  const reloadAccounts = () => run('accounts', async () => {
    await googleAdsOAuth('accounts', { site_id: siteId });
    refresh();
  });

  const disconnect = () => run('disconnect', async () => {
    if (!window.confirm('Disconnect Google Ads from this site? CortIQ revokes its access at Google and deletes the stored credentials.')) return;
    await googleAdsOAuth('disconnect', { site_id: siteId });
    toast.success('Google Ads disconnected');
    refresh();
  });

  const accounts = connection?.accessible_customers ?? [];

  return (
    <Card id="google-ads">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Google Ads</CardTitle>
            <CardDescription>
              Billed clicks, Google's invalid-click counts, placements and location targets for Click fraud and Paid ads,
              and Enhanced Conversions uploads. Read access to reports; CortIQ never changes campaigns.
            </CardDescription>
          </div>
          {connection && (
            ready && connection.status === 'connected'
              ? <Badge className="bg-green-600 shrink-0">Connected</Badge>
              : connection.status === 'error'
                ? <Badge variant="destructive" className="shrink-0">Needs attention</Badge>
                : <Badge variant="secondary" className="shrink-0">Pick an account</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="h-10 bg-muted animate-pulse rounded" />
        ) : !connection ? (
          <div className="space-y-3">
            <Button onClick={connect} disabled={busy !== null}>
              {busy === 'connect' && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Sign in with Google
            </Button>
            <p className="text-xs text-muted-foreground">
              Use the Google login that has access to the Ads account (directly or through a manager account).
              Google's consent screen asks for full Google Ads access, because that is the only scope the Ads API offers.
              CortIQ only reads reports and uploads Enhanced Conversions adjustments when you turn that on.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {connection.status === 'error' && connection.last_error && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  {connection.last_error} Try "Reload accounts", or disconnect and sign in again.
                </AlertDescription>
              </Alert>
            )}

            {accounts.length === 0 ? (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  No Google Ads accounts were found for this Google login. Sign in with a login that has access to the account,
                  or ask the account owner to add you in Google Ads → Admin → Access and security.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="google-ads-account">Account for this site</label>
                <Select value={connection.customer_id ?? undefined} onValueChange={select} disabled={busy !== null}>
                  <SelectTrigger id="google-ads-account" className="max-w-md">
                    <SelectValue placeholder="Pick a Google Ads account" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {(a.name || 'Unnamed account')} · {formatCustomerId(a.id)}
                        {a.login_customer_id ? ` (via ${formatCustomerId(a.login_customer_id)})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {ready && (
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                Reporting on {connection.descriptive_name || 'account'} {formatCustomerId(connection.customer_id)}
                {connection.currency_code ? ` · ${connection.currency_code}` : ''}
                {connection.time_zone ? ` · ${connection.time_zone}` : ''}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={reloadAccounts} disabled={busy !== null}>
                {busy === 'accounts' ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
                Reload accounts
              </Button>
              <Button variant="outline" size="sm" onClick={disconnect} disabled={busy !== null}>
                {busy === 'disconnect' ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Unplug className="h-3.5 w-3.5 mr-1.5" />}
                Disconnect
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Empty-state hint for tabs that use Google Ads data. */
export function GoogleAdsConnectHint({ onNavigate, children }: { onNavigate?: (tab: string) => void; children?: ReactNode }) {
  return (
    <Alert>
      <AlertTriangle className="h-4 w-4" />
      <AlertDescription className="text-sm flex flex-wrap items-center gap-x-3 gap-y-2">
        <span>{children ?? 'Connect Google Ads under Settings → Integrations → Google Ads to add billed clicks, invalid clicks and placements.'}</span>
        {onNavigate && (
          <Button variant="outline" size="sm" onClick={() => onNavigate('integrations')}>Open integrations</Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
