import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { AlertTriangle, MessageSquareQuote, Plus, Trash2, Copy } from 'lucide-react';
import { toast } from 'sonner';
import {
  useReportedChannelConfig, useUpdateReportedChannelConfig, isReportedChannelConfigured,
} from '@/hooks/useReportedChannel';
import {
  REPORTED_CHANNELS, REPORTED_CHANNEL_LABELS, MAX_MAP_ENTRIES, FORM_FIELD_PATTERN, HUBSPOT_PROPERTY_PATTERN,
  rowsToMap, mapToRows, noticeTemplate, NOTICE_ADAPT_NOTE, type MapRow, type ReportedChannel,
} from '@/lib/reportedChannel';
import type { Site } from '@/types/dashboard';

function MapEditor({ rows, onChange }: { rows: MapRow[]; onChange: (rows: MapRow[]) => void }) {
  const set = (i: number, patch: Partial<MapRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="space-y-2">
      <div className="flex gap-2 text-xs text-muted-foreground">
        <div className="flex-1">Answer value (as sent by the form or HubSpot)</div>
        <div className="w-48">Category</div>
        <div className="w-9" />
      </div>
      {rows.map((r, i) => (
        <div key={i} className="flex gap-2">
          <Input className="flex-1" value={r.answer} maxLength={100} placeholder="chatgpt"
            onChange={(e) => set(i, { answer: e.target.value })} />
          <select
            className="w-48 h-10 rounded-md border border-input bg-background px-2 text-sm"
            value={r.channel}
            onChange={(e) => set(i, { channel: e.target.value as ReportedChannel | '' })}
          >
            <option value="">Pick a category</option>
            {REPORTED_CHANNELS.map((c) => <option key={c} value={c}>{REPORTED_CHANNEL_LABELS[c]}</option>)}
          </select>
          <Button type="button" variant="ghost" size="icon" aria-label="Remove row"
            onClick={() => onChange(rows.filter((_, j) => j !== i))}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" disabled={rows.length >= MAX_MAP_ENTRIES}
        onClick={() => onChange([...rows, { answer: '', channel: '' }])}>
        <Plus className="h-4 w-4 mr-1" /> Add answer value
      </Button>
      <p className="text-xs text-muted-foreground">
        Matching ignores case and surrounding spaces. An answer that is not in this list is counted as Other. Up to {MAX_MAP_ENTRIES} values.
      </p>
    </div>
  );
}

function Notice({ text }: { text: string }) {
  return (
    <div className="space-y-1">
      <Textarea readOnly value={text} rows={5} className="text-xs" />
      <Button type="button" variant="outline" size="sm"
        onClick={() => navigator.clipboard?.writeText(text).then(() => toast.success('Copied'), () => toast.error('Could not copy'))}>
        <Copy className="h-4 w-4 mr-1" /> Copy
      </Button>
    </div>
  );
}

/** Settings → Integrations: self-reported source ("how did you hear about us?"), attribution layer 1.5. */
export function ReportedChannelSettings({ selectedSite }: { selectedSite: Site }) {
  const { data: config, isLoading } = useReportedChannelConfig(selectedSite.id);
  const update = useUpdateReportedChannelConfig(selectedSite.id);

  const [policyVersion, setPolicyVersion] = useState('');
  const [hubspotProperty, setHubspotProperty] = useState('');
  const [hubspotRows, setHubspotRows] = useState<MapRow[]>([]);
  const [formField, setFormField] = useState('');
  const [formRows, setFormRows] = useState<MapRow[]>([]);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    if (!config) return;
    // Never prefilled from the banner: the version in effect today was consented to without the notice.
    setPolicyVersion(config.policyVersion ?? '');
    setConfirmed(false);
    setHubspotProperty(config.hubspotProperty ?? '');
    setHubspotRows(mapToRows(config.hubspotMap));
    setFormField(config.formField ?? '');
    setFormRows(mapToRows(config.formMap));
  }, [config]);

  if (isLoading || !config) return null;

  const hubspot = rowsToMap(hubspotRows);
  const form = rowsToMap(formRows);
  const errors: string[] = [];
  const pv = policyVersion.trim();
  const hp = hubspotProperty.trim();
  const ff = formField.trim();
  if ((hp || ff) && (pv.length < 1 || pv.length > 20)) errors.push('Set the policy version (1–20 characters).');
  if (hp && !HUBSPOT_PROPERTY_PATTERN.test(hp)) errors.push('HubSpot property: use the internal name (letters, digits, underscore).');
  if (hp && config.hubspotQualityProperty && hp.toLowerCase() === config.hubspotQualityProperty.toLowerCase()) {
    errors.push('HubSpot property must differ from the lead quality property.');
  }
  if (ff && !FORM_FIELD_PATTERN.test(ff)) errors.push('Form field: use the field name attribute, not a CSS selector.');
  if (hp) errors.push(...hubspot.errors.map((e) => `HubSpot: ${e}`));
  if (ff) errors.push(...form.errors.map((e) => `Form: ${e}`));
  // Switching a path on, or changing the version, needs a NEW version: consents already given under the
  // banner's current version were given without the notice. The server also ignores consents older
  // than the switch-on time (sites.reported_channel_enabled_at).
  const enabling = (!!hp && !config.hubspotProperty) || (!!ff && !config.formField) || (!!(hp || ff) && pv !== (config.policyVersion ?? ''));
  if (enabling && pv && config.bannerPolicyVersion && pv === config.bannerPolicyVersion) {
    errors.push(`Enter a new policy version. ${pv} is the version your banner sends now, and those consents were given without the notice.`);
  }
  if (enabling && !confirmed) errors.push('Confirm that you have updated the texts and will raise the policy version.');
  const bannerMismatch = !!pv && !!config.bannerPolicyVersion && pv !== config.bannerPolicyVersion;
  const cookieless = config.trackingMode === 'cookieless';

  const save = () => {
    update.mutate({
      reported_channel_policy_version: hp || ff ? pv : null,
      reported_channel_hubspot_property: hp || null,
      reported_channel_hubspot_map: hp ? hubspot.map : {},
      reported_channel_form_field: ff || null,
      reported_channel_form_map: ff ? form.map : {},
    }, {
      onSuccess: () => toast.success('Self-reported source saved'),
      onError: () => toast.error('Could not save self-reported source'),
    });
  };
  const turnOff = () => {
    update.mutate({
      reported_channel_policy_version: null, reported_channel_hubspot_property: null, reported_channel_hubspot_map: {},
      reported_channel_form_field: null, reported_channel_form_map: {},
    }, { onSuccess: () => toast.success('Self-reported source turned off') });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <MessageSquareQuote className="h-4 w-4" /> Self-reported source
        </CardTitle>
        <CardDescription>
          Map the answers to a &quot;how did you hear about us?&quot; question to a fixed list of categories, shown in Ads → Attribution
          next to where the converting visit came from. Full tracking mode only; answers are stored only for consented visits.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 text-sm">
        {cookieless && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              This site uses cookieless mode, which records no conversions, so no answers are stored. Self-reported source needs Full mode.
            </AlertDescription>
          </Alert>
        )}

        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="space-y-2 text-xs">
            <p><strong>Before you turn this on</strong></p>
            <ol className="list-decimal pl-4 space-y-1">
              <li>
                Your consent texts must say that the answer may be stored. The CortIQ banner names it from version 5.5.21 in all its
                languages. If you use your own consent tool, add the sentence there yourself.
              </li>
              <li>
                The WordPress plugin&apos;s built-in banner never qualifies: it records the choice under its own id, not the visit, so
                no answer is stored. Use the CortIQ banner (5.5.21 or later) instead.
              </li>
              <li>Update your privacy policy (see the GDPR template, &quot;Self-reported source&quot;) and add the notice below next to the question.</li>
              <li>
                Enter a new policy version here (not the one your banner sends now) and save. Then raise the policy version in Consent
                settings to the same value so visitors are asked again. Answers are only stored for consents given under this version
                after you switched this on.
              </li>
              <li>
                Only conversions in the same visit where the visitor made the banner choice qualify. A conversion in a later visit,
                without a new banner choice, is stored without an answer.
              </li>
            </ol>
          </AlertDescription>
        </Alert>

        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-xs">
            Ask only about channels. Do not offer answer options that reveal sensitive information such as health, religion, political
            views, union membership, ethnicity or sexual orientation, and never map a free-text field. The category list is fixed for this reason.
          </AlertDescription>
        </Alert>

        <div className="space-y-1">
          <Label htmlFor="rc-policy">Policy version</Label>
          <Input id="rc-policy" className="w-40" maxLength={20} value={policyVersion} onChange={(e) => setPolicyVersion(e.target.value)} />
          {bannerMismatch && (
            <p className="text-xs text-amber-600">
              Your banner currently sends policy version {config.bannerPolicyVersion}. Answers are only stored once both match.
            </p>
          )}
        </div>

        <div className="space-y-2 border-t pt-4">
          <div className="font-medium">HubSpot property (needs marketing consent)</div>
          <p className="text-xs text-muted-foreground">
            Use a dropdown or radio select property (an enumeration), not a text property, so every answer is one of your own options.
            CortIQ maps the value in memory and keeps only the category; the value itself is not stored. Only contacts whose hashed email
            matches a conversion recorded with marketing consent are counted.
          </p>
          <p className="text-xs text-amber-600">
            The contact must fill in the property themselves, in a HubSpot form. Do not let staff set it after a call or meeting: the
            consent and the notice cover the visitor&apos;s own answer only.
          </p>
          <p className="text-xs text-muted-foreground">
            HubSpot&apos;s contact.propertyChange webhook usually carries no email address, and without one nothing is matched. Send the
            change from a HubSpot workflow webhook that includes the contact&apos;s email.
          </p>
          <Input placeholder="how_did_you_hear" value={hubspotProperty} maxLength={100} onChange={(e) => setHubspotProperty(e.target.value)} />
          {hp && <MapEditor rows={hubspotRows} onChange={setHubspotRows} />}
          {hp && <Notice text={noticeTemplate('hubspot', selectedSite.site_name ?? '')} />}
        </div>

        <div className="space-y-2 border-t pt-4">
          <div className="font-medium">Form field (needs statistics consent)</div>
          <p className="text-xs text-muted-foreground">
            The name of one select or radio field on a tracked form. On submit the tracker reads only that field, maps the selected
            option to a category in the browser and sends the category. Text fields, text areas and &quot;other, please specify&quot;
            fields are never read.
          </p>
          <Input placeholder="how_did_you_hear" value={formField} maxLength={100} onChange={(e) => setFormField(e.target.value)} />
          {ff && <MapEditor rows={formRows} onChange={setFormRows} />}
          {ff && <Notice text={noticeTemplate('form', selectedSite.site_name ?? '')} />}
        </div>

        <p className="text-xs text-muted-foreground">
          The notices are a starting point for your own text, not legal advice. {NOTICE_ADAPT_NOTE} The category stays in CortIQ: it is not sent to Google Ads,
          Google Analytics or AI insights, and it is only shown as totals.
        </p>

        <label className="flex items-start gap-2 text-xs">
          <input type="checkbox" className="mt-0.5" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
          <span>I have updated the banner and privacy texts, and I will raise the policy version in Consent settings to the version above.</span>
        </label>

        {errors.length > 0 && (
          <ul className="text-xs text-red-600 list-disc pl-4">{errors.map((e) => <li key={e}>{e}</li>)}</ul>
        )}
        <div className="flex gap-2">
          <Button size="sm" onClick={save} disabled={errors.length > 0 || update.isPending}>Save</Button>
          {isReportedChannelConfigured(config) && (
            <Button size="sm" variant="outline" onClick={turnOff} disabled={update.isPending}>Turn off</Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
