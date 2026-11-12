import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { supabase } from '@/integrations/supabase/client';
import { POLICY_CHECKLIST_VERSION, policyChecklist, type TrackingMode } from '@/lib/policyChecklist';
import { bannerDetailsProblem, buildTrackingSnippet, type ConsentSetup } from '@/lib/trackingSnippet';
import { pinnedScripts, pinStatus, type SriManifest } from '@/lib/sriPin';
import sriManifest from '@/lib/sri-manifest.json';
import { toast } from 'sonner';

interface TrackingSnippetSetupProps {
  siteId: string;
  trackingKey: string;
  aggregateMeasurement: boolean;
  /** sites.tracking_mode; the guide writes the chosen mode back when the policy is confirmed. */
  trackingMode?: TrackingMode;
  apiBase: string;
  /** Origin that serves cortiq.js and consent-banner.js. */
  scriptOrigin: string;
}

interface Confirmation {
  consent_setup: string;
  tracking_mode: string;
  marketing: boolean;
  policy_url: string | null;
  checklist_version: string;
  confirmed_at: string;
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

const MODES: { value: TrackingMode; label: string; description: string }[] = [
  {
    value: 'cookieless',
    label: 'Cookieless',
    description: 'No cookies. After consent a session id is kept in sessionStorage for the tab\'s lifetime. Page views, heatmaps, click/scroll and goals. No returning-visitor recognition and no ad measurement.',
  },
  {
    value: 'full',
    label: 'Full',
    description: 'Adds a session id in sessionStorage, returning-visitor recognition from device details and conversion records. Optional ad-click measurement with marketing consent.',
  },
];

// Install snippet with the site's consent setup. Shared by the Setup tab and the onboarding wizard.
export function TrackingSnippetSetup({ siteId, trackingKey, aggregateMeasurement, trackingMode: siteMode, apiBase, scriptOrigin }: TrackingSnippetSetupProps) {
  const [consentSetup, setConsentSetup] = useState<ConsentSetup>('own-cmp');
  const [aggregateOn, setAggregateOn] = useState(aggregateMeasurement);
  const [saving, setSaving] = useState(false);
  const [company, setCompany] = useState('');
  const [policyUrl, setPolicyUrl] = useState('');
  const [policyVersion, setPolicyVersion] = useState('1');
  const [googleConsentMode, setGoogleConsentMode] = useState(false);
  const [mode, setMode] = useState<TrackingMode>('cookieless');
  const [marketing, setMarketing] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pinned, setPinned] = useState(false);
  // sites.sri_pinned_version: the version of the last pinned snippet copied for this site.
  const [pinnedVersion, setPinnedVersion] = useState<string | null>(null);

  // Prefill the banner's policy link and version from the site's GDPR settings, and the choices
  // from the latest policy confirmation, so a returning owner sees the snippet they confirmed.
  useEffect(() => {
    let cancelled = false;
    supabase.from('gdpr_settings').select('privacy_policy_url, policy_version').eq('site_id', siteId).maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        if (data.privacy_policy_url) setPolicyUrl(url => url || data.privacy_policy_url!);
        if (data.policy_version) setPolicyVersion(data.policy_version);
      });
    supabase.from('sites').select('sri_pinned_version').eq('id', siteId).maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data?.sri_pinned_version) return;
        setPinnedVersion(data.sri_pinned_version);
        setPinned(true);
      });
    supabase.from('policy_confirmations')
      .select('consent_setup, tracking_mode, marketing, policy_url, checklist_version, confirmed_at')
      .eq('site_id', siteId).order('confirmed_at', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        setConfirmation(data);
        setConsentSetup(data.consent_setup as ConsentSetup);
        setMode(data.tracking_mode as TrackingMode);
        setMarketing(data.marketing);
        if (data.policy_url) setPolicyUrl(data.policy_url);
      });
    return () => { cancelled = true; };
  }, [siteId]);

  const withConsent = consentSetup !== 'none';
  const useMarketing = mode === 'full' && marketing;
  const checklist = policyChecklist({ trackingMode: mode, marketing: useMarketing });
  const trimmedPolicyUrl = policyUrl.trim();
  // A confirmation counts only for the exact install it was given for.
  const confirmed = !!confirmation
    && confirmation.consent_setup === consentSetup
    && confirmation.tracking_mode === mode
    && confirmation.marketing === useMarketing
    && confirmation.checklist_version === POLICY_CHECKLIST_VERSION
    && (consentSetup !== 'cortiq-banner' || confirmation.policy_url === trimmedPolicyUrl);

  // The banner names the controller and links the policy, so no snippet until both are real.
  const bannerProblem = consentSetup === 'cortiq-banner' ? bannerDetailsProblem({ company, policyUrl }) : null;
  const gateProblem = bannerProblem
    ?? (withConsent && !confirmed ? 'Confirm that your privacy policy covers the items above to get the snippet.' : null);
  const pin = pinnedScripts(scriptOrigin, sriManifest as SriManifest);
  const usePin = pinned && withConsent;
  const status = pinStatus(pinnedVersion, sriManifest as SriManifest);
  const snippet = gateProblem ? '' : buildTrackingSnippet({
    apiUrl: apiBase,
    siteId,
    trackingKey,
    ...(usePin
      ? pin
      : { scriptSrc: `${scriptOrigin}/cortiq.js`, bannerSrc: `${scriptOrigin}/consent-banner.js` }),
    aggregate: aggregateOn,
    consentSetup,
    company,
    policyUrl,
    policyVersion,
    googleConsentMode,
    trackingMode: mode,
    marketing: useMarketing,
  });

  // Remember which snippet the owner took, so the dashboard can warn a pinned site about fixes it
  // does not get automatically. Never blocks the copy.
  const copySnippet = async () => {
    navigator.clipboard.writeText(snippet);
    toast.success('Copied to clipboard!');
    const version = usePin ? pin.version : null;
    if (version === pinnedVersion) return;
    const { error } = await supabase.from('sites').update({ sri_pinned_version: version }).eq('id', siteId);
    if (error) {
      console.error('Error saving pinned version:', error);
      return;
    }
    setPinnedVersion(version);
  };

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

  // Log the confirmation, then align sites.tracking_mode with the snippet: the server refuses
  // visitor identification and conversion records for a site set to cookieless.
  const confirmPolicy = async () => {
    if (consentSetup === 'none') return;
    setConfirming(true);
    const { data, error } = await supabase.from('policy_confirmations').insert({
      site_id: siteId,
      consent_setup: consentSetup,
      tracking_mode: mode,
      marketing: useMarketing,
      policy_url: trimmedPolicyUrl || null,
      checklist_version: POLICY_CHECKLIST_VERSION,
      checklist,
    }).select('consent_setup, tracking_mode, marketing, policy_url, checklist_version, confirmed_at').single();
    if (error || !data) {
      setConfirming(false);
      console.error('Error logging policy confirmation:', error);
      toast.error('Could not save the confirmation');
      return;
    }
    if (siteMode !== mode) {
      const { error: modeError } = await supabase.from('sites').update({ tracking_mode: mode }).eq('id', siteId);
      if (modeError) {
        setConfirming(false);
        console.error('Error updating tracking mode:', modeError);
        toast.error('Could not set the tracking mode for this site');
        return;
      }
    }
    setConfirming(false);
    setConfirmation(data);
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

      {withConsent && (
        <div className="space-y-2">
          <Label>What should CortIQ measure after consent?</Label>
          <RadioGroup value={mode} onValueChange={v => setMode(v as TrackingMode)} className="gap-2 sm:grid-cols-2">
            {MODES.map(m => (
              <label key={m.value} htmlFor={`mode-${m.value}`}
                className={`flex items-start gap-3 rounded-md border p-3 cursor-pointer ${mode === m.value ? 'border-primary bg-primary/5' : ''}`}>
                <RadioGroupItem id={`mode-${m.value}`} value={m.value} className="mt-0.5" />
                <span>
                  <span className="block text-sm font-medium">{m.label}</span>
                  <span className="block text-xs text-muted-foreground">{m.description}</span>
                </span>
              </label>
            ))}
          </RadioGroup>
          {mode === 'full' && (
            <label htmlFor="snippet-marketing" className="flex items-start gap-3 cursor-pointer">
              <Checkbox id="snippet-marketing" checked={marketing} onCheckedChange={v => setMarketing(v === true)} className="mt-0.5" />
              <span>
                <span className="block text-sm font-medium">Measure ad clicks and send lead quality to Google Ads</span>
                <span className="block text-xs text-muted-foreground">Needs marketing consent as well.
                  {consentSetup === 'cortiq-banner'
                    ? ' The banner then asks for marketing.'
                    : ' Your consent tool must ask for marketing; CortIQ reads that choice.'}</span>
              </span>
            </label>
          )}
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
          <label htmlFor="banner-gcm" className="flex items-start gap-3 sm:col-span-2 cursor-pointer">
            <Checkbox id="banner-gcm" checked={googleConsentMode} onCheckedChange={v => setGoogleConsentMode(v === true)}
              className="mt-0.5" />
            <span>
              <span className="block text-sm font-medium">Send Google Consent Mode v2 signals</span>
              <span className="block text-xs text-muted-foreground">Only if the site runs Google Analytics, Google Ads or
                Tag Manager and nothing else sets Consent Mode. Google tags then wait for the visitor's choice.</span>
            </span>
          </label>
        </div>
      )}

      {withConsent && (
        <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm space-y-2">
          <p className="font-medium">Your privacy policy must cover this before you install</p>
          <p className="text-xs text-muted-foreground">You are the controller for this data; CortIQ processes it on
            your behalf. Check your policy against each point:</p>
          <ul className="list-disc pl-5 space-y-1 text-xs">
            {checklist.map(item => <li key={item}>{item}</li>)}
          </ul>
          <p className="text-xs text-muted-foreground">This list covers what CortIQ does on your behalf. It is not legal
            advice and not a full list of what your policy must say under GDPR.</p>
          <label htmlFor="policy-confirm" className="flex items-start gap-3 pt-1 cursor-pointer">
            <Checkbox id="policy-confirm" checked={confirmed} disabled={confirmed || confirming || !!bannerProblem}
              onCheckedChange={v => { if (v === true) confirmPolicy(); }} className="mt-0.5" />
            <span className="text-sm">
              I have checked that my privacy policy{consentSetup === 'cortiq-banner' && trimmedPolicyUrl ? ` (${trimmedPolicyUrl})` : ''} covers
              each point above.
              {confirmed && confirmation && (
                <span className="block text-xs text-muted-foreground">
                  Confirmed {new Date(confirmation.confirmed_at).toLocaleString()}. Changing the choices above asks again.
                </span>
              )}
            </span>
          </label>
        </div>
      )}

      {status?.behind && (
        status.securityFixes.length > 0 ? (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">
            <p className="font-medium">Security fix not installed</p>
            <p className="text-xs">
              {`This site's snippet is pinned to version ${pinnedVersion}. ${status.securityFixes.length > 1
                ? `Versions ${status.securityFixes.join(', ')} fix`
                : `Version ${status.securityFixes[0]} fixes`} a security issue in the tracker or banner.`}
              {' '}Pinned sites do not update automatically: copy the snippet below and replace the old one on every page.
            </p>
          </div>
        ) : (
          <p className="rounded-md border p-3 text-xs text-muted-foreground">
            This site's snippet is pinned to version {pinnedVersion}; {status.latest} is available. It stays on
            {' '}{pinnedVersion} until you replace the snippet.
          </p>
        )
      )}

      {withConsent && (
        <label htmlFor="snippet-pinned" className="flex items-start gap-3 cursor-pointer">
          <Checkbox id="snippet-pinned" checked={pinned} onCheckedChange={v => setPinned(v === true)} className="mt-0.5" />
          <span>
            <span className="block text-sm font-medium">Pin version {pin.version} with Subresource Integrity (SRI)</span>
            <span className="block text-xs text-muted-foreground">The browser checks a cryptographic hash of the
              {consentSetup === 'cortiq-banner' ? ' tracker and banner' : ' tracker'} and refuses to run them if the file
              on cortiq.se has been changed. Fixes and new features then reach the site only when you replace the
              snippet; this page warns you when a newer version fixes a security issue.</span>
          </span>
        </label>
      )}

      <div>
        <div className="flex items-center justify-between">
          <Label>Tracking snippet — paste before &lt;/body&gt; on every page</Label>
          <Button variant="outline" size="sm" className="text-xs" disabled={!snippet} onClick={copySnippet}>Copy</Button>
        </div>
        {gateProblem ? (
          <p className="mt-2 rounded-md border border-dashed p-4 text-sm text-muted-foreground">{gateProblem}</p>
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
          <li><code>data-categories</code> follows your choices above: <code>analytics</code>, plus <code>marketing</code> when
            you measure ad clicks. Add <code>preferences</code> only if the site has such features and gates them on this
            choice.</li>
          <li>Bump <code>data-policy-version</code> when the policy or the categories change — visitors are asked again.</li>
          {googleConsentMode && (
            <li>Google Consent Mode v2 is on: move the banner tag into <code>&lt;head&gt;</code> above your Google tags
              and remove <code>defer</code>, so they wait for the choice (denied until then). Marketing grants the ad
              signals only if it is listed in <code>data-categories</code>.</li>
          )}
          <li>Languages: Swedish, English, German, French, Portuguese (from <code>&lt;html lang&gt;</code>, or set <code>data-lang</code>).</li>
          <li>The banner helps you collect and document consent. You remain responsible for your policy text and the
            purposes you list.</li>
        </ul>
      )}

      {withConsent && (
        <p className="text-xs text-muted-foreground">
          The tracker is requested only after analytics consent. Page views, sessions, AI referrals, heatmaps, click/scroll, conversions and in-browser agent
          signals all wait for consent.
          {mode === 'cookieless'
            ? ' Cookieless keeps the session id in sessionStorage for the tab\'s lifetime and skips returning-visitor recognition and all ad measurement. Add sessionStorage: false to keep it in memory only (every full page load is then a new visit).'
            : ' Full mode also stores a session id in sessionStorage and recognises returning visitors.'}
          {useMarketing && ' Ad click IDs and the email hash also need marketing consent.'}
          {' '}Confirming sets this site's tracking mode to {mode === 'full' ? 'Full' : 'Cookieless'}.
          {aggregateOn && ' Exception: aggregate measurement is on, so page views are also counted before consent, with no device storage.'}
        </p>
      )}
    </div>
  );
}
