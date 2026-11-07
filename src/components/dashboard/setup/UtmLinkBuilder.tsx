// src/components/dashboard/setup/UtmLinkBuilder.tsx
// Builds a UTM-tagged link. Values are lowercased and trimmed so "Facebook" and "facebook"
// do not end up as two sources in the reports.
import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Check, Copy, Link2 } from 'lucide-react';
import { PAID_MEDIUMS } from '@/lib/paidMediums';

const MEDIUM_PRESETS: { value: string; label: string }[] = [
  { value: 'cpc', label: 'cpc: search ads' },
  { value: 'paid-social', label: 'paid-social: social ads' },
  { value: 'display', label: 'display: banner ads' },
  { value: 'social', label: 'social: unpaid posts' },
  { value: 'email', label: 'email: newsletters' },
  { value: 'referral', label: 'referral: partner sites' },
];

const clean = (v: string) => v.trim().toLowerCase().replace(/\s+/g, '-');

export function buildUtmUrl(base: string, p: { source: string; medium: string; campaign: string; content?: string; term?: string }): string | null {
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(base.trim()) ? base.trim() : `https://${base.trim()}`);
  } catch {
    return null;
  }
  const params: [string, string | undefined][] = [
    ['utm_source', p.source], ['utm_medium', p.medium], ['utm_campaign', p.campaign],
    ['utm_content', p.content], ['utm_term', p.term],
  ];
  for (const [key, value] of params) {
    const v = clean(value ?? '');
    if (v) url.searchParams.set(key, v); else url.searchParams.delete(key);
  }
  return url.toString();
}

export function UtmLinkBuilder({ domain }: { domain?: string }) {
  const host = (domain ?? '').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const [base, setBase] = useState(host ? `https://${host}/` : '');
  const [source, setSource] = useState('');
  const [medium, setMedium] = useState('');
  const [campaign, setCampaign] = useState('');
  const [content, setContent] = useState('');
  const [term, setTerm] = useState('');
  const [copied, setCopied] = useState(false);

  const url = useMemo(() => buildUtmUrl(base, { source, medium, campaign, content, term }), [base, source, medium, campaign, content, term]);
  const complete = !!url && !!clean(source) && !!clean(medium) && !!clean(campaign);
  const isPaid = (PAID_MEDIUMS as readonly string[]).includes(clean(medium));

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked: the link stays selectable below */
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Link2 className="h-4 w-4" /> UTM link builder
        </CardTitle>
        <CardDescription>
          Tag a link so the visit shows up under Campaigns, Social media and Ads. Values are lowercased.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="utm-base">Page the link points to</Label>
          <Input id="utm-base" value={base} onChange={(e) => setBase(e.target.value)} placeholder="https://example.com/offer" />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="utm-source">Source (utm_source)</Label>
            <Input id="utm-source" value={source} onChange={(e) => setSource(e.target.value)} placeholder="google, facebook, newsletter" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="utm-medium">Medium (utm_medium)</Label>
            <Input id="utm-medium" list="utm-medium-presets" value={medium} onChange={(e) => setMedium(e.target.value)} placeholder="cpc" />
            <datalist id="utm-medium-presets">
              {MEDIUM_PRESETS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="utm-campaign">Campaign (utm_campaign)</Label>
            <Input id="utm-campaign" value={campaign} onChange={(e) => setCampaign(e.target.value)} placeholder="spring-sale" />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="utm-content">Content (utm_content, optional)</Label>
            <Input id="utm-content" value={content} onChange={(e) => setContent(e.target.value)} placeholder="banner-a" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="utm-term">Term (utm_term, optional)</Label>
            <Input id="utm-term" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="keyword" />
          </div>
        </div>

        {url === null && base.trim() !== '' && <p className="text-sm text-destructive">That page address is not a valid URL.</p>}
        {url && (
          <div className="space-y-2">
            <code className="block break-all rounded bg-muted p-2 text-xs">{url}</code>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm" onClick={copy} disabled={!complete}>
                {copied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
                {copied ? 'Copied' : 'Copy link'}
              </Button>
              {!complete && <span className="text-xs text-muted-foreground">Fill in source, medium and campaign.</span>}
              {complete && (
                <span className="text-xs text-muted-foreground">
                  {isPaid ? 'Counts as an ad visit in Ads and Click fraud.' : 'Not a paid medium: shows under Campaigns, not Ads.'}
                </span>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
