import { useState, type ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, CheckCircle, Copy, Loader2, RefreshCw, Unplug } from 'lucide-react';
import { toast } from 'sonner';
import { formatCustomerId, googleAdsOAuth, useGoogleAdsConnection } from '@/hooks/useGoogleAdsConnection';

interface GoogleAdsConnectCardProps {
  siteId: string;
}

/** Copy-paste box for the final URL suffix that makes utm_campaign reach CortIQ. */
export function FinalUrlSuffixHint({ suffix, children }: { suffix: string; children?: ReactNode }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(suffix);
      toast.success('Copied');
    } catch {
      toast.error('Copy failed. Select the text and copy it.');
    }
  };
  return (
    <div className="space-y-1.5 text-sm">
      {children}
      <div className="flex items-center gap-2">
        <code className="rounded bg-muted px-2 py-1 text-xs break-all select-all">{suffix}</code>
        <Button variant="outline" size="sm" onClick={copy} aria-label="Copy final URL suffix">
          <Copy className="h-3.5 w-3.5" />
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Google Ads → Admin → Account settings → Tracking → Final URL suffix. A campaign's own suffix replaces the account's,
        so add it there too for campaigns that have one.
      </p>
    </div>
  );
}

/**
 * Settings → Integrations → Google Ads. Sign in with Google (adwords scope, offline access),
 * pick the account this site reports on, pick the "Import from clicks" conversion action that
 * receives lead-quality uploads, check the final URL suffix, disconnect. Used by Click fraud,
 * Paid ads and the lead-quality upload. No developer token or client secret is entered here:
 * those are set once on the CortIQ instance.
 */
export function GoogleAdsConnectCard({ siteId }: GoogleAdsConnectCardProps) {
  const { connection, isLoading, ready, refresh } = useGoogleAdsConnection(siteId);
  const [busy, setBusy] = useState<null | 'connect' | 'select' | 'accounts' | 'action' | 'setup' | 'disconnect'>(null);

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

  const selectAction = (actionId: string) => run('action', async () => {
    await googleAdsOAuth('select_conversion_action', { site_id: siteId, conversion_action_id: actionId });
    toast.success('Conversion action selected');
    refresh();
  });

  const recheck = () => run('setup', async () => {
    const res = await googleAdsOAuth<{ errors?: string[] }>('refresh_setup', { site_id: siteId });
    if (res?.errors?.length) toast.error(res.errors[0]);
    else toast.success('Google Ads setup checked');
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
  const actions = connection?.conversion_actions ?? [];
  const tracking = connection?.tracking_check ?? null;
  const withoutUtm = tracking?.campaigns_without_utm ?? [];

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
              CortIQ only reads reports, and uploads lead-quality conversions to the conversion action you pick.
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

            {ready && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="google-ads-conversion-action">Conversion action for lead-quality uploads</label>
                {actions.length > 0 && (
                  <Select value={connection.conversion_action_id ?? undefined} onValueChange={selectAction} disabled={busy !== null}>
                    <SelectTrigger id="google-ads-conversion-action" className="max-w-md">
                      <SelectValue placeholder="Pick a conversion action" />
                    </SelectTrigger>
                    <SelectContent>
                      {actions.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}{a.category ? ` · ${a.category.toLowerCase().replace(/_/g, ' ')}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {connection.conversion_action_id ? (
                  <p className="text-xs text-muted-foreground">
                    HubSpot lead quality (Priority, Qualified) is uploaded as click conversions to
                    "{connection.conversion_action_name || connection.conversion_action_id}".
                  </p>
                ) : (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription className="text-sm">
                      {actions.length > 0
                        ? 'No conversion action picked. Lead-quality uploads wait until one is picked.'
                        : connection.setup_checked_at
                          ? 'This account has no enabled "Import from clicks" conversion action. Create one in Google Ads → Goals → Conversions → New conversion action → Import → Manual import using API or uploads → Track conversions from clicks, then press Recheck setup.'
                          : 'The account has not been checked yet. Press Recheck setup to list its conversion actions.'}
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}

            {ready && tracking && !tracking.ok && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <FinalUrlSuffixHint suffix={tracking.suggested_suffix}>
                    <p>
                      {tracking.account_has_utm_campaign
                        ? `${tracking.campaigns_without_utm_count} enabled campaign(s) have their own final URL suffix without utm_campaign`
                          + (withoutUtm.length > 0 ? ` (${withoutUtm.slice(0, 5).map((c) => c.name).join(', ')}${tracking.campaigns_without_utm_count > 5 ? ', …' : ''})` : '')
                        : 'The account final URL suffix does not set utm_campaign'}
                      . Visits with a gclid from the last 90 days still match their campaign through Google Ads; older visits and
                      gbraid/wbraid clicks need utm_campaign. Add this final URL suffix:
                    </p>
                  </FinalUrlSuffixHint>
                  {tracking.auto_tagging === false && (
                    <p className="text-xs mt-2">Auto-tagging is off, so landing URLs carry no gclid. Turn it on under Admin → Account settings → Auto-tagging.</p>
                  )}
                </AlertDescription>
              </Alert>
            )}

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={reloadAccounts} disabled={busy !== null}>
                {busy === 'accounts' ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
                Reload accounts
              </Button>
              {ready && (
                <Button variant="outline" size="sm" onClick={recheck} disabled={busy !== null}>
                  {busy === 'setup' ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
                  Recheck setup
                </Button>
              )}
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
