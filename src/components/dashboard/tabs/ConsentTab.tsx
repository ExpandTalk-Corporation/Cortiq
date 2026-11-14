import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Site } from '@/types/dashboard';
import type { SitePatch } from '@/hooks/useSites';
import { BANNER_LANGUAGES, type BannerLanguage, type ConsentSetup } from '@/lib/trackingSnippet';

type ConsentCmp = 'cookiebot' | 'cookieyes' | 'onetrust' | 'google-consent-mode' | 'other';

type ConsentSite = Site & {
  consent_setup?: ConsentSetup | null;
  consent_cmp?: ConsentCmp | null;
  banner_language?: BannerLanguage;
  tracking_mode?: string;
  aggregate_measurement?: boolean;
};

interface ConsentTabProps {
  selectedSite: Site;
  onSiteUpdated?: (patch: SitePatch) => void;
  onNavigate?: (tab: string) => void;
}

const SETUP_OPTIONS: { value: ConsentSetup; label: string; description: string }[] = [
  {
    value: 'cortiq-banner',
    label: 'CortIQ consent banner',
    description: 'The install snippet adds our banner. CortIQ loads after the visitor accepts analytics.',
  },
  {
    value: 'own-cmp',
    label: 'My own banner or CMP',
    description: 'Cookiebot, CookieYes, OneTrust, Google Consent Mode or similar. CortIQ reads its choice.',
  },
  {
    value: 'none',
    label: 'No banner',
    description: 'Only consent-free aggregate counting. Requires aggregate measurement below.',
  },
];

const CMP_LABELS: Record<ConsentCmp, string> = {
  cookiebot: 'Cookiebot',
  cookieyes: 'CookieYes',
  onetrust: 'OneTrust',
  'google-consent-mode': 'Google Consent Mode (other CMP)',
  other: 'Other',
};

const LANGUAGE_LABELS: Record<BannerLanguage, string> = {
  auto: 'Automatic (from the page’s <html lang>)',
  sv: 'Swedish',
  en: 'English',
  de: 'German',
  fr: 'French',
  pt: 'Portuguese',
};

/** Settings → Consent & cookie banner: the one place for banner choice, language and tracking mode. */
export function ConsentTab({ selectedSite, onSiteUpdated, onNavigate }: ConsentTabProps) {
  const site = selectedSite as ConsentSite;
  const [setup, setSetup] = useState<ConsentSetup | null>(site.consent_setup ?? null);
  const [cmp, setCmp] = useState<ConsentCmp | null>(site.consent_cmp ?? null);
  const [language, setLanguage] = useState<BannerLanguage>(site.banner_language ?? 'auto');
  const [mode, setMode] = useState<'cookieless' | 'full'>(site.tracking_mode === 'full' ? 'full' : 'cookieless');
  const [aggregate, setAggregate] = useState(site.aggregate_measurement === true);
  const [saving, setSaving] = useState(false);

  const save = async (patch: SitePatch, success: string): Promise<boolean> => {
    setSaving(true);
    const { error } = await supabase.from('sites').update(patch as never).eq('id', site.id);
    setSaving(false);
    if (error) {
      console.error('Error updating consent settings:', error);
      toast.error('Could not save the setting');
      return false;
    }
    onSiteUpdated?.(patch);
    toast.success(success);
    return true;
  };

  const changeSetup = async (value: ConsentSetup) => {
    if (await save({ consent_setup: value }, 'Banner choice saved — copy the updated snippet in Setup.')) setSetup(value);
  };

  const changeCmp = async (value: ConsentCmp) => {
    if (await save({ consent_cmp: value }, 'Consent tool saved')) setCmp(value);
  };

  const changeLanguage = async (value: BannerLanguage) => {
    if (await save({ banner_language: value }, 'Banner language saved — copy the updated snippet in Setup.')) setLanguage(value);
  };

  const changeMode = async (value: 'cookieless' | 'full') => {
    if (await save({ tracking_mode: value }, value === 'cookieless' ? 'Switched to cookieless mode' : 'Switched to full tracking')) setMode(value);
  };

  const changeAggregate = async (enabled: boolean) => {
    if (await save({ aggregate_measurement: enabled }, enabled ? 'Aggregate measurement on' : 'Aggregate measurement off')) setAggregate(enabled);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Consent banner</CardTitle>
          <CardDescription>How visitors on {site.domain} give consent. The install snippet in Setup follows this choice.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {setup === null && (
            <Alert>
              <AlertDescription>No banner choice saved for this site yet.</AlertDescription>
            </Alert>
          )}
          <RadioGroup
            value={setup ?? ''}
            onValueChange={(v) => changeSetup(v as ConsentSetup)}
            disabled={saving}
            className="gap-3"
          >
            {SETUP_OPTIONS.map((option) => (
              <Label
                key={option.value}
                htmlFor={`consent-${option.value}`}
                className="flex items-start gap-3 rounded-md border p-3 cursor-pointer font-normal"
              >
                <RadioGroupItem value={option.value} id={`consent-${option.value}`} className="mt-0.5" />
                <span>
                  <span className="block font-medium">{option.label}</span>
                  <span className="block text-sm text-muted-foreground">{option.description}</span>
                </span>
              </Label>
            ))}
          </RadioGroup>

          {setup === 'own-cmp' && (
            <div className="space-y-2">
              <Label>Which consent tool?</Label>
              <Select value={cmp ?? undefined} onValueChange={(v) => changeCmp(v as ConsentCmp)} disabled={saving}>
                <SelectTrigger className="w-full sm:w-80"><SelectValue placeholder="Select your CMP" /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(CMP_LABELS) as ConsentCmp[]).map((key) => (
                    <SelectItem key={key} value={key}>{CMP_LABELS[key]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">For your records. The loader reads any of these the same way.</p>
            </div>
          )}

          {setup === 'none' && !aggregate && (
            <Alert variant="destructive">
              <AlertDescription>No banner measures nothing until aggregate measurement is turned on below.</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {setup === 'cortiq-banner' && (
        <Card>
          <CardHeader>
            <CardTitle>Banner language</CardTitle>
            <CardDescription>The CortIQ banner ships in Swedish, English, German, French and Portuguese.</CardDescription>
          </CardHeader>
          <CardContent>
            <Select value={language} onValueChange={(v) => changeLanguage(v as BannerLanguage)} disabled={saving}>
              <SelectTrigger className="w-full sm:w-80"><SelectValue /></SelectTrigger>
              <SelectContent>
                {BANNER_LANGUAGES.map((code) => (
                  <SelectItem key={code} value={code}>{LANGUAGE_LABELS[code]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Tracking mode</CardTitle>
          <CardDescription>What CortIQ does after analytics consent, and whether it counts anything before it.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <RadioGroup value={mode} onValueChange={(v) => changeMode(v as 'cookieless' | 'full')} disabled={saving} className="gap-3">
            <Label htmlFor="mode-cookieless" className="flex items-start gap-3 rounded-md border p-3 cursor-pointer font-normal">
              <RadioGroupItem value="cookieless" id="mode-cookieless" className="mt-0.5" />
              <span>
                <span className="block font-medium">Cookieless</span>
                <span className="block text-sm text-muted-foreground">No cookies; the session id is kept in sessionStorage after consent. No marketing features.</span>
              </span>
            </Label>
            <Label htmlFor="mode-full" className="flex items-start gap-3 rounded-md border p-3 cursor-pointer font-normal">
              <RadioGroupItem value="full" id="mode-full" className="mt-0.5" />
              <span>
                <span className="block font-medium">Full tracking</span>
                <span className="block text-sm text-muted-foreground">Returning visitors and click IDs (with marketing consent).</span>
              </span>
            </Label>
          </RadioGroup>

          <div className="flex items-start justify-between gap-4 rounded-md border p-3">
            <div>
              <Label htmlFor="aggregate-switch" className="font-medium">Aggregate measurement</Label>
              <p className="text-sm text-muted-foreground">
                Counts page views, visits and sources before consent, designed to not require consent: no cookies, no device storage, no IDs.
              </p>
            </div>
            <Switch id="aggregate-switch" checked={aggregate} onCheckedChange={changeAggregate} disabled={saving} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-6">
          <p className="text-sm text-muted-foreground">
            Changes here change the install snippet. Copy it again and replace the one on your site (or update the WordPress plugin setting).
          </p>
          {onNavigate && <Button onClick={() => onNavigate('setup')}>Open Setup & snippet</Button>}
        </CardContent>
      </Card>
    </div>
  );
}
