import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { supabase } from '@/integrations/supabase/client';
import { buildTrackingSnippet, type ConsentSetup } from '@/lib/trackingSnippet';
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

  const snippet = buildTrackingSnippet({
    apiUrl: apiBase,
    siteId,
    trackingKey,
    scriptSrc: `${scriptOrigin}/spa-tracking.js`,
    bannerSrc: `${scriptOrigin}/consent-banner.js`,
    aggregate: aggregateOn,
    consentSetup,
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

      <div>
        <div className="flex items-center justify-between">
          <Label>Tracking snippet — paste before &lt;/body&gt; on every page</Label>
          <Button variant="outline" size="sm" className="text-xs" onClick={() => {
            navigator.clipboard.writeText(snippet);
            toast.success('Copied to clipboard!');
          }}>Copy</Button>
        </div>
        <pre className="bg-muted text-foreground p-4 rounded-md font-mono text-xs mt-2 overflow-x-auto whitespace-pre-wrap break-all">
          {snippet}
        </pre>
      </div>

      {consentSetup === 'cortiq-banner' && (
        <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-1">
          <li>Set <code>data-company</code> to your legal company name — the banner names you as responsible for the data.</li>
          <li>Set <code>data-policy-url</code> to your privacy policy and describe CortIQ there as your processor, with how
            long you keep the data.</li>
          <li>List only the purposes you use in <code>data-categories</code>: <code>analytics</code>, plus <code>marketing</code> if you
            measure ad clicks and send lead quality to Google Ads, and <code>preferences</code> only if the site has such
            features and gates them on this choice.</li>
          <li>Bump <code>data-policy-version</code> when the policy or the categories change — visitors are asked again.</li>
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
