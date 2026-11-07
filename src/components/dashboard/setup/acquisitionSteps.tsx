// src/components/dashboard/setup/acquisitionSteps.tsx
// Setup steps for the Acquisition tabs, built from live readiness. Copy states only what
// the code does: tracking_sessions rows need analytics consent (spa-tracking.js, also in
// cookieless mode); Ads/Click fraud classify paid visits by utm_medium; GA4 reads need
// ga_integration_enabled + ga_property_id + Viewer access for the service account.
import type { AcquisitionReadiness } from '@/hooks/useAcquisitionReadiness';
import { PAID_MEDIUMS } from '@/lib/paidMediums';
import type { ChecklistStep } from './SetupChecklist';

const code = (s: string) => <code className="rounded bg-muted px-1 text-xs">{s}</code>;

export function trackingStep(r: AcquisitionReadiness): ChecklistStep {
  return {
    id: 'tracking',
    title: 'The tracking script records visits',
    status: r.recent.sessions ? 'done' : 'todo',
    detail: (
      <>
        <p>
          {r.recent.sessions
            ? 'Visits were recorded in the last 30 days.'
            : 'No visits recorded in the last 30 days. Install the tracking script on every page that ads and links point to.'}{' '}
          Only visitors who accept analytics cookies are recorded{r.trackingMode === 'cookieless' ? ', in cookieless mode too' : ''}.
        </p>
        {r.aggregateMeasurement && (
          <p>Aggregate measurement is on: Overview also counts sources and UTM tags from visitors who did not accept.</p>
        )}
      </>
    ),
    action: { label: 'Open setup', tab: 'setup' },
  };
}

export function utmStep(r: AcquisitionReadiness, opts: { optional?: boolean; builderBelow?: boolean } = {}): ChecklistStep {
  return {
    id: 'utm',
    title: 'Links carry UTM tags',
    status: r.recent.taggedSessions ? 'done' : 'todo',
    optional: opts.optional,
    detail: (
      <p>
        {r.recent.taggedSessions ? 'Tagged visits arrived in the last 30 days. ' : 'No tagged visits in the last 30 days. '}
        Add {code('utm_source')}, {code('utm_medium')} and {code('utm_campaign')} to the links in ads, newsletters and posts
        {opts.builderBelow ? ': use the link builder below.' : '.'}
      </p>
    ),
    action: opts.builderBelow ? undefined : { label: 'Open link builder', tab: 'campaigns' },
  };
}

export function socialSourceStep(r: AcquisitionReadiness): ChecklistStep {
  return {
    ...utmStep(r, { optional: true }),
    title: 'Social links carry UTM tags',
    detail: (
      <p>
        Visits from Facebook, Instagram, LinkedIn, X, TikTok, YouTube, Pinterest and Reddit are recognised by the referring
        site even without tags. Tags also catch visits where the app hides the referrer, and name the campaign. Put the
        platform name in {code('utm_source')}, for example {code('utm_source=linkedin&utm_medium=social&utm_campaign=launch')}.
      </p>
    ),
  };
}

export function paidMediumStep(r: AcquisitionReadiness): ChecklistStep {
  return {
    id: 'paid-medium',
    title: 'Ad links use a paid utm_medium',
    status: r.recent.paidSessions ? 'done' : 'todo',
    detail: (
      <>
        <p>
          A visit counts as an ad visit when {code('utm_medium')} is {PAID_MEDIUMS.map((m, i) => (
            <span key={m}>{i > 0 && (i === PAID_MEDIUMS.length - 1 ? ' or ' : ', ')}{code(m)}</span>
          ))}. Google Ads auto-tagging ({code('gclid')}) alone is not read for this.
        </p>
        <p>Google Ads: Final URL suffix (campaign settings → Campaign URL options): {code('utm_source=google&utm_medium=cpc&utm_campaign={campaignid}')}</p>
        <p>Meta Ads: Ad → Tracking → URL parameters: {code('utm_source=facebook&utm_medium=paid-social&utm_campaign={{campaign.name}}')}</p>
      </>
    ),
    action: { label: 'Open link builder', tab: 'campaigns' },
  };
}

export function goalsStep(r: AcquisitionReadiness): ChecklistStep {
  return {
    id: 'goals',
    title: 'Conversion goals are defined',
    status: r.goals > 0 ? 'done' : 'todo',
    detail: (
      <p>
        {r.goals > 0 ? `${r.goals} goal${r.goals === 1 ? '' : 's'} defined. ` : ''}
        A goal is what counts as a conversion: a visit to a page (such as a thank-you page), a form submission or a click.
      </p>
    ),
    action: { label: 'Open goals', tab: 'conversion-goals' },
  };
}

export function conversionStep(r: AcquisitionReadiness): ChecklistStep {
  return {
    id: 'conversion',
    title: 'Conversions are recorded',
    status: r.recent.conversions ? 'done' : 'todo',
    detail: (
      <p>
        {r.recent.conversions
          ? 'Conversions were recorded in the last 30 days.'
          : 'No conversion recorded in the last 30 days. Once a goal is reached by a visitor who accepted analytics cookies, it shows up here.'}
      </p>
    ),
  };
}

export function ga4Steps(r: AcquisitionReadiness): ChecklistStep[] {
  return [
    {
      id: 'ga4-property',
      title: 'GA4 property is connected',
      status: r.ga4Connected ? 'done' : 'todo',
      detail: <p>Enter the numeric GA4 property ID under Settings → Integrations → Google Analytics Integration.</p>,
      action: { label: 'Open integrations', tab: 'integrations' },
    },
    {
      id: 'ga4-access',
      title: 'CortIQ may read the property',
      status: 'unknown',
      detail: (
        <p>
          CortIQ reads GA4 with a Google service account. Its email needs the Viewer role in Google Analytics → Admin → Property
          access management. Test Configuration in the GA4 integration reports a permission error if it is missing.
        </p>
      ),
    },
    {
      id: 'ga4-ads-link',
      title: 'Google Ads is linked to GA4',
      status: 'unknown',
      optional: true,
      detail: <p>Ad cost, clicks and impressions come from the Google Ads link in GA4 (Admin → Product links → Google Ads links).</p>,
    },
    {
      id: 'ga4-medium',
      title: 'Paid traffic has a paid medium in GA4',
      status: 'unknown',
      detail: (
        <p>
          This view includes GA4 sessions with medium {code('cpc')}, {code('ppc')}, {code('paid-social')} or {code('display')}.
          Linked Google Ads traffic with auto-tagging gets {code('cpc')}; other ad platforms need UTM tags.
        </p>
      ),
    },
  ];
}

export function googleAdsApiStep(r: AcquisitionReadiness): ChecklistStep {
  return {
    id: 'google-ads-api',
    title: 'Google Ads API is connected',
    status: r.googleAdsApi ? 'done' : 'todo',
    optional: true,
    detail: <p>Adds Google's own invalid-click counts per campaign next to CortIQ's estimate. Set it up in the card below.</p>,
  };
}

export function hubspotStep(r: AcquisitionReadiness): ChecklistStep {
  return {
    id: 'hubspot',
    title: 'HubSpot lead quality loop is on',
    status: r.hubspotLoop ? 'done' : 'todo',
    optional: true,
    detail: (
      <>
        <p>Compares CortIQ conversions with the leads HubSpot marks as Priority or Qualified.</p>
        {r.trackingMode === 'cookieless' && (
          <p>
            This site uses cookieless mode, where conversions carry no hashed email, so HubSpot leads cannot be matched to
            them. Matching needs full tracking mode and marketing consent.
          </p>
        )}
      </>
    ),
    action: { label: 'Open integrations', tab: 'integrations' },
  };
}
