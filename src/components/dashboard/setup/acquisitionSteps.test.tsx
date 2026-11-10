import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AcquisitionReadiness } from '@/hooks/useAcquisitionReadiness';
import { PAID_MEDIUMS } from '@/lib/paidMediums';
import { buildUtmUrl } from './UtmLinkBuilder';
import { SetupChecklist } from './SetupChecklist';
import { goalsStep, hubspotStep, paidMediumStep, trackingStep, utmStep } from './acquisitionSteps';

const empty: AcquisitionReadiness = {
  trackingMode: 'full',
  aggregateMeasurement: false,
  ga4Connected: false,
  googleAdsApi: false,
  googleAdsConversionAction: false,
  googleAdsCustomerId: false,
  hubspotLoop: false,
  goals: 0,
  recent: { sessions: false, taggedSessions: false, paidSessions: false, conversions: false },
};

const html = (node: React.ReactNode) => renderToStaticMarkup(<>{node}</>);

describe('buildUtmUrl', () => {
  it('adds https, lowercases and dashes values, keeps existing query params', () => {
    expect(buildUtmUrl('example.com/offer?ref=1', { source: ' Facebook ', medium: 'Paid-Social', campaign: 'Spring Sale' }))
      .toBe('https://example.com/offer?ref=1&utm_source=facebook&utm_medium=paid-social&utm_campaign=spring-sale');
  });

  it('drops empty optional params and rejects an invalid URL', () => {
    expect(buildUtmUrl('https://example.com/', { source: 'google', medium: 'cpc', campaign: 'x', content: ' ', term: '' }))
      .toBe('https://example.com/?utm_source=google&utm_medium=cpc&utm_campaign=x');
    expect(buildUtmUrl('http://', { source: 'a', medium: 'b', campaign: 'c' })).toBeNull();
  });
});

describe('acquisition steps', () => {
  it('mirror live readiness', () => {
    expect(trackingStep(empty).status).toBe('todo');
    expect(goalsStep({ ...empty, goals: 2 }).status).toBe('done');
    expect(paidMediumStep({ ...empty, recent: { ...empty.recent, paidSessions: true } }).status).toBe('done');
    expect(utmStep(empty, { builderBelow: true }).action).toBeUndefined();
  });

  it('warns about cookieless mode only when the site uses it', () => {
    expect(html(hubspotStep(empty).detail)).not.toContain('cookieless');
    expect(html(hubspotStep({ ...empty, trackingMode: 'cookieless' }).detail)).toContain('cookieless mode');
  });

  it('states the consent requirement for recorded visits', () => {
    expect(html(trackingStep(empty).detail)).toContain('accept analytics cookies');
  });

  it('hides the action of a finished step', () => {
    const markup = renderToStaticMarkup(
      <SetupChecklist title="t" steps={[goalsStep({ ...empty, goals: 1 }), trackingStep(empty)]} onNavigate={() => {}} />,
    );
    expect(markup).toContain('1 of 2 steps done');
    expect(markup).not.toContain('Open goals');
    expect(markup).toContain('Open setup');
  });
});

describe('copy matches the code', () => {
  it('lists the same paid mediums as paid-ads-analytics', () => {
    const fn = readFileSync('supabase/functions/paid-ads-analytics/index.ts', 'utf8');
    const list = fn.match(/\.in\('utm_medium', \[([^\]]+)\]\)/)?.[1];
    expect(list?.split(',').map((m) => m.trim().replace(/'/g, ''))).toEqual([...PAID_MEDIUMS]);
  });

  it('the CortIQ ads view does not claim cookie-free or server-side collection', () => {
    const tab = readFileSync('src/components/dashboard/tabs/ServerSidePaidAdsTab.tsx', 'utf8');
    expect(tab).not.toMatch(/without cookies|GDPR-compliant|server-side/i);
  });
});
