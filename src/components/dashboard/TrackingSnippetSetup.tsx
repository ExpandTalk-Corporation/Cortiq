import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { supabase } from '@/integrations/supabase/client';
import { bannerDetailsProblem, buildTrackingSnippet, type ConsentSetup } from '@/lib/trackingSnippet';
import { toast } from 'sonner';

interface TrackingSnippetSetupProps {
  siteId: string;
  trackingKey: string;
  aggregateMeasurement: boolean;
  apiBase: string;
  /** Origin that serves spa-tracking.js and consent-banner.js. */
  scriptOrigin: string;
}

const OPTIONS: { value: ConsentSetup; label: string; description: string }[] = [
  {
    value: 'own-cmp',
    label: 'I already have a consent banner',
    description: 'Cookiebot, Google Consent Mode v2 or another CMP. CortIQ loads after the visitor accepts statistics/analytics.',
  },
  {
    value: 'cortiq-banner',
    label: 'Add the CortIQ consent banner',
    description: 'A lightweight banner with accept and reject on the same level, a permanent "Cookie settings" button and each choice logged as proof. Full tracking for visitors who accept.',
  },
  {
    value: 'none',
    label: 'No banner — aggregate counts only',
    description: 'Page views, visits, sources and goals without cookies, device storage or IDs. No per-visitor data, heatmaps or session paths. Add server-side agent measurement below for AI crawlers.',
  },
];

// Install snippet with the site's consent setup. Shared by the Setup tab and the onboarding wizard.
export function TrackingSnippetSetup({ siteId, trackingKey, aggregateMeasurement, apiBase, scriptOrigin }: TrackingSnippetSetupProps) {
  const [consentSetup, setConsentSetup] = useState<ConsentSetup>('own-cmp');
  const [aggregateOn, setAggregateOn] = useState(aggregateMeasurement);
  const [saving, setSaving] = useState(false);
  const [company, setCompany] = useState('');
  const [policyUrl, setPolicyUrl] = useState('');
  const [policyVersion, setPolicyVersion] = useState('1');

  // Prefill the banner's policy link and version from the site's GDPR settings, if set.
  useEffect(() => {
    let cancelled = false;
    supabase.from('gdpr_settings').select('privacy_policy_url, policy_version').eq('site_id', siteId).maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        if (data.privacy_policy_url) setPolicyUrl(url => url || data.privacy_policy_url!);
        if (data.policy_version) setPolicyVersion(data.policy_version);
      });
    return () => { cancelled = true; };
  }, [siteId]);

  // The banner names the controller and links the policy, so no snippet until both are real.
  const bannerProblem = consentSetup === 'cortiq-banner' ? bannerDetailsProblem({ company, policyUrl }) : null;
  const snippet = bannerProblem ? '' : buildTrackingSnippet({
    apiUrl: apiBase,
    siteId,
    trackingKey,
    scriptSrc: `${scriptOrigin}/spa-tracking.js`,
    bannerSrc: `${scriptOrigin}/consent-banner.js`,
    aggregate: aggregateOn,
    consentSetup,
    company,
    policyUrl,
    policyVersion,
  });

  const enableAggregate = async () => {
    setSaving(true);
    const { error } = await supabase.from('sites').update({ aggregate_measurement: true }).eq('id', siteId);
    setSaving(false);
    if (error) {
      console.error('Error enabling aggregate measurement:', error);
      toast.error('Could not turn on aggregate measurement');
      return;
    }
    setAggregateOn(true);
    toast.success('Aggregate measurement on');
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>How does your site collect consent?</Label>
        <RadioGroup value={consentSetup} onValueChange={v => setConsentSetup(v as ConsentSetup)} className="gap-2">
          {OPTIONS.map(o => (
            <label key={o.value} htmlFor={`consent-${o.value}`}
              className={`flex items-start gap-3 rounded-md border p-3 cursor-pointer ${consentSetup === o.value ? 'border-primary bg-primary/5' : ''}`}>
              <RadioGroupItem id={`consent-${o.value}`} value={o.value} className="mt-0.5" />
              <span>
                <span className="block text-sm font-medium">{o.label}</span>
                <span className="block text-xs text-muted-foreground">{o.description}</span>
              </span>
            </label>
          ))}
        </RadioGroup>
      </div>

      {consentSetup === 'none' && !aggregateOn && (
        <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm space-y-2">
          <p>Aggregate measurement is off for this site, so this snippet would count nothing.</p>
          <Button size="sm" onClick={enableAggregate} disabled={saving}>Turn on aggregate measurement</Button>
        </div>
      )}

      {consentSetup === 'cortiq-banner' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="banner-company">Legal company name</Label>
            <Input id="banner-company" value={company} maxLength={120} placeholder="As registered, e.g. Example AB"
              onChange={e => setCompany(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="banner-policy">Privacy policy URL</Label>
            <Input id="banner-policy" value={policyUrl} maxLength={500} placeholder="https://example.com/privacy"
              onChange={e => setPolicyUrl(e.target.value)} />
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between">
          <Label>Tracking snippet — paste before &lt;/body&gt; on every page</Label>
          <Button variant="outline" size="sm" className="text-xs" disabled={!snippet} onClick={() => {
            navigator.clipboard.writeText(snippet);
            toast.success('Copied to clipboard!');
          }}>Copy</Button>
        </div>
        {bannerProblem ? (
          <p className="mt-2 rounded-md border border-dashed p-4 text-sm text-muted-foreground">{bannerProblem}</p>
        ) : (
          <pre className="bg-muted text-foreground p-4 rounded-md font-mono text-xs mt-2 overflow-x-auto whitespace-pre-wrap break-all">
            {snippet}
          </pre>
        )}
      </div>

      {consentSetup === 'cortiq-banner' && (
        <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-1">
          <li>The banner names your company as responsible for the data and links your privacy policy. Describe CortIQ
            there as your processor, with how long you keep the data.</li>
          <li>List only the purposes you use in <code>data-categories</code>: <code>analytics</code>, plus <code>marketing</code> if you
            measure ad clicks and send lead quality to Google Ads, and <code>preferences</code> only if the site has such
            features and gates them on this choice.</li>
          <li>Bump <code>data-policy-version</code> when the policy or the categories change — visitors are asked again.</li>
          <li>Google Analytics, Google Ads or Tag Manager on the site? The banner sends Google Consent Mode v2 signals
            (denied until the visitor chooses). Move the banner tag into <code>&lt;head&gt;</code> above your Google tags
            and remove <code>defer</code>, so they wait for the choice. Marketing grants the ad signals only if it is
            listed in <code>data-categories</code>.</li>
          <li>Languages: Swedish, English, German, French, Portuguese (from <code>&lt;html lang&gt;</code>, or set <code>data-lang</code>).</li>
          <li>The banner helps you collect and document consent. You remain responsible for your policy text and the
            purposes you list.</li>
        </ul>
      )}

      {consentSetup !== 'none' && (
        <p className="text-xs text-muted-foreground">
          The tracker is requested only after analytics consent, so nothing — not even the file request — reaches
          CortIQ before that. Page views, sessions, AI referrals, heatmaps, click/scroll, conversions and in-browser agent
          signals all wait for consent, also with <code>cookieless: true</code> (which drops fingerprinting and persistent
          IDs). Paid-ads click IDs need marketing consent.
          {aggregateOn && ' Aggregate measurement is on: page views are also counted without consent, with no device storage.'}
        </p>
      )}
    </div>
  );
}
