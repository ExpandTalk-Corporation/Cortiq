import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useCreateRun, useSuggestPages, type RunRow } from '@/hooks/useTrackingCheck';
import type { Mode, PolicyTemplate } from '../../../supabase/functions/_shared/tracking-check/types.ts';

type Flag = Exclude<keyof PolicyTemplate, 'expectedIds' | 'manualItems'>;
const FLAGS: { key: Flag; label: string }[] = [
  { key: 'noGoogleBeforeConsent', label: 'Nothing is sent to Google before consent or after "Reject all"' },
  { key: 'consentDefaultsDenied', label: 'Consent Mode v2 defaults are "denied"' },
  { key: 'ga4RequiresAnalytics', label: 'Google Analytics only runs with Statistics consent' },
  { key: 'adsRequiresMarketing', label: 'Google Ads only runs with Marketing consent' },
  { key: 'enhancedConversionsOff', label: 'Enhanced Conversions is off' },
  { key: 'noUnknownVendorsAfterReject', label: 'No unknown third parties after "Reject all"' },
];
const MANUAL_ITEMS = [
  { key: 'ga4_retention', label: 'GA4 data retention is set to the agreed period (Admin → Data collection and modification → Data retention)' },
  { key: 'google_terms', label: 'Google Ads and GA4 data processing terms are accepted' },
  { key: 'conversion_on_submit', label: 'The conversion fires when the form is submitted (test with Tag Assistant)' },
];
const LIMIT = { comparison: 25, policy: 15 };
const allFlags = () => Object.fromEntries(FLAGS.map((f) => [f.key, true])) as Record<Flag, boolean>;

interface PageChoice { path: string; selected: boolean; note?: string }

export function StartForm({ prefill }: { prefill?: RunRow }) {
  const navigate = useNavigate();
  const suggest = useSuggestPages();
  const create = useCreateRun();
  const [mode, setMode] = useState<Mode>(prefill?.mode ?? 'policy');
  const [baselineUrl, setBaselineUrl] = useState(prefill?.baseline_url ?? '');
  const [targetUrl, setTargetUrl] = useState(prefill?.target_url ?? '');
  const [pages, setPages] = useState<PageChoice[]>((prefill?.pages.pages ?? []).map((path) => ({ path, selected: true })));
  const [extraPath, setExtraPath] = useState('');
  const [legacy, setLegacy] = useState((prefill?.pages.legacy ?? []).join('\n'));
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [flags, setFlags] = useState<Record<Flag, boolean>>(prefill?.policy ? (Object.fromEntries(FLAGS.map((f) => [f.key, prefill.policy![f.key]])) as Record<Flag, boolean>) : allFlags());
  const [expectedIds, setExpectedIds] = useState((prefill?.policy?.expectedIds ?? []).join(', '));
  const [manual, setManual] = useState<string[]>(prefill?.policy?.manualItems.map((i) => i.key) ?? MANUAL_ITEMS.map((i) => i.key));

  const selected = pages.filter((p) => p.selected).map((p) => p.path);
  const limit = LIMIT[mode];
  const browserLoads = selected.length * (mode === 'comparison' ? 2 : 1);
  const minutes = Math.max(1, Math.ceil((browserLoads * 40) / 60));
  const sourceUrl = mode === 'comparison' ? baselineUrl : targetUrl;

  const loadPages = () => suggest.mutate(sourceUrl, {
    onSuccess: ({ pages: found }) => {
      if (!found.length) toast.info('No sitemap found. Add the pages to test below.');
      setPages(found.map((p) => ({ path: p.path, selected: p.selected && found.indexOf(p) < limit, note: p.reason === 'form' ? 'likely form' : undefined })));
    },
    onError: (e) => toast.error(e.message),
  });

  const toggle = (path: string) => setPages((list) => list.map((p) => (p.path === path ? { ...p, selected: !p.selected } : p)));
  const addPath = () => {
    const path = extraPath.trim();
    if (!path) return;
    const normalised = path.startsWith('/') ? path : `/${path}`;
    setPages((list) => (list.some((p) => p.path === normalised) ? list : [...list, { path: normalised, selected: true }]));
    setExtraPath('');
  };

  const submit = () => {
    if (selected.length > limit) { toast.error(`Select at most ${limit} pages.`); return; }
    create.mutate({
      mode,
      baselineUrl: mode === 'comparison' ? baselineUrl : undefined,
      targetUrl,
      pages: selected,
      legacyPaths: mode === 'comparison' ? legacy.split('\n').map((l) => l.trim()).filter(Boolean) : [],
      policy: mode === 'policy' ? {
        ...flags,
        expectedIds: expectedIds.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean),
        manualItems: MANUAL_ITEMS.filter((i) => manual.includes(i.key)),
      } : undefined,
      basicAuth: username ? { username, password } : null,
    }, {
      onSuccess: ({ runId }) => navigate(`/tracking-check/${runId}`),
      onError: (e) => toast.error(e.message),
    });
  };

  return (
    <Card>
      <CardHeader><CardTitle>New Tracking Check</CardTitle></CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Check type">
          {(['policy', 'comparison'] as const).map((m) => (
            <Button key={m} type="button" role="radio" aria-checked={mode === m} variant={mode === m ? 'default' : 'outline'} className="h-auto flex-col items-start py-3" onClick={() => setMode(m)}>
              <span className="font-semibold">{m === 'comparison' ? 'Comparison' : 'Consent policy'}</span>
              <span className="text-xs font-normal opacity-80">{m === 'comparison' ? 'Current site vs new site' : 'One site vs agreed commitments'}</span>
            </Button>
          ))}
        </div>

        {mode === 'comparison' && (
          <div className="space-y-2">
            <Label htmlFor="tc-baseline">Current site (expected behaviour)</Label>
            <Input id="tc-baseline" placeholder="https://www.example.com" value={baselineUrl} onChange={(e) => setBaselineUrl(e.target.value)} />
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="tc-target">{mode === 'comparison' ? 'New site' : 'Site to check'}</Label>
          <Input id="tc-target" placeholder="https://staging.example.com" value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)} />
        </div>

        <Collapsible>
          <CollapsibleTrigger asChild><Button variant="link" className="h-auto p-0">Does the site need a password? (basic auth)</Button></CollapsibleTrigger>
          <CollapsibleContent className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="tc-user">Username</Label><Input id="tc-user" autoComplete="off" value={username} onChange={(e) => setUsername(e.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="tc-pass">Password</Label><Input id="tc-pass" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
            <p className="text-xs text-muted-foreground sm:col-span-2">Stored encrypted only while the check runs, deleted after at most 2 hours.</p>
          </CollapsibleContent>
        </Collapsible>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <Label>Pages to test ({selected.length} of max {limit})</Label>
            <Button type="button" variant="outline" size="sm" disabled={!sourceUrl || suggest.isPending} onClick={loadPages}>
              {suggest.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}Suggest from sitemap
            </Button>
          </div>
          {pages.length > 0 && (
            <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border p-3">
              {pages.map((p) => (
                <label key={p.path} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={p.selected} onCheckedChange={() => toggle(p.path)} />
                  <span className="font-mono">{p.path}</span>
                  {p.note && <span className="text-xs text-muted-foreground">({p.note})</span>}
                </label>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Input aria-label="Add a page path" placeholder="/pricing/" value={extraPath} onChange={(e) => setExtraPath(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addPath(); } }} />
            <Button type="button" variant="outline" onClick={addPath}>Add</Button>
          </div>
        </div>

        {mode === 'comparison' && (
          <div className="space-y-2">
            <Label htmlFor="tc-legacy">Old URLs that should redirect on the new site (one per line)</Label>
            <Textarea id="tc-legacy" rows={3} placeholder={'/product/\n/in-depth/'} value={legacy} onChange={(e) => setLegacy(e.target.value)} />
          </div>
        )}

        {mode === 'policy' && (
          <div className="space-y-3">
            <Label>Commitments to check</Label>
            {FLAGS.map((f) => (
              <label key={f.key} className="flex items-start gap-2 text-sm">
                <Checkbox checked={flags[f.key]} onCheckedChange={(v) => setFlags({ ...flags, [f.key]: v === true })} />{f.label}
              </label>
            ))}
            <div className="space-y-2">
              <Label htmlFor="tc-ids">Expected IDs (optional)</Label>
              <Input id="tc-ids" placeholder="G-XXXXXXX, AW-123456789, GTM-XXXX" value={expectedIds} onChange={(e) => setExpectedIds(e.target.value)} />
            </div>
            <Label>Checked manually (added to the report as to-dos)</Label>
            {MANUAL_ITEMS.map((i) => (
              <label key={i.key} className="flex items-start gap-2 text-sm">
                <Checkbox checked={manual.includes(i.key)} onCheckedChange={(v) => setManual(v === true ? [...manual, i.key] : manual.filter((k) => k !== i.key))} />{i.label}
              </label>
            ))}
          </div>
        )}

        <Button className="w-full" disabled={!targetUrl || (mode === 'comparison' && !baselineUrl) || !selected.length || create.isPending} onClick={submit}>
          {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
          Start check · about {minutes} min
        </Button>
      </CardContent>
    </Card>
  );
}
