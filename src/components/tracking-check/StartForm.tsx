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
import type { Mode } from '../../../supabase/functions/_shared/tracking-check/types.ts';
import { COMMITMENT_LABEL, type CommitmentFlag } from '../../../supabase/functions/_shared/tracking-check/report.ts';

type Flag = CommitmentFlag;
const FLAGS: { key: Flag; label: string; hint?: string }[] = (Object.keys(COMMITMENT_LABEL) as Flag[]).map((key) => ({
  key,
  label: COMMITMENT_LABEL[key],
  hint: key === 'noGoogleBeforeConsent'
    ? 'Tick only if the site has decided on Consent Mode basic. Unticked, cookieless Google pings are reported as "Review", not "Problem".'
    : key === 'consentDefaultsDenied' ? 'Untick if you do not use Consent Mode.' : undefined,
}));
const MANUAL_ITEMS = [
  { key: 'ga4_retention', label: 'GA4 data retention is set to the agreed period (Admin → Data collection and modification → Data retention)' },
  { key: 'google_terms', label: 'Google Ads and GA4 data processing terms are accepted' },
  { key: 'conversion_on_submit', label: 'The conversion fires when the form is submitted (test with Tag Assistant)' },
  { key: 'reject_equal', label: '"Reject all" is as easy as "Accept all" and no categories are pre-ticked' },
  { key: 'privacy_policy', label: 'The privacy policy names Google as a recipient, the US transfer (Data Privacy Framework) and how to withdraw consent' },
  { key: 'consent_mode_decision', label: 'Consent Mode basic or advanced is decided and documented by the controller' },
];
// Consent Mode basic vs advanced is the controller's decision: the strict Google commitment is opt-in.
const defaultFlags = () => Object.fromEntries(FLAGS.map((f) => [f.key, f.key !== 'noGoogleBeforeConsent'])) as Record<Flag, boolean>;

interface PageChoice { path: string; selected: boolean; note?: string }

function normalisePath(raw: string): string {
  const path = raw.trim();
  return !path ? '' : path.startsWith('/') ? path : `/${path}`;
}

const MODES: { mode: Mode; title: string; text: string }[] = [
  { mode: 'policy', title: 'Does my site respect the cookie choice?', text: 'Check one site: what loads before the banner is answered, after "Reject all" and after "Accept all".' },
  { mode: 'comparison', title: 'Moving or rebuilding the site?', text: 'Compare the current site with the new one before launch: redirects, UTM and click IDs, tags and consent.' },
];

interface Limits { policyPages: number; comparisonPages: number }

export function StartForm({ prefill, initialUrl, initialMode, limits }: { prefill?: RunRow; initialUrl?: string; initialMode?: Mode; limits: Limits }) {
  const navigate = useNavigate();
  const suggest = useSuggestPages();
  const create = useCreateRun();
  const [mode, setMode] = useState<Mode>(prefill?.mode ?? initialMode ?? 'policy');
  const [baselineUrl, setBaselineUrl] = useState(prefill?.baseline_url ?? '');
  const [targetUrl, setTargetUrl] = useState(prefill?.target_url ?? initialUrl ?? '');
  // The homepage is preselected so a first check can start without any page setup.
  const [pages, setPages] = useState<PageChoice[]>((prefill?.pages.pages ?? ['/']).map((path) => ({ path, selected: true })));
  const [extraPath, setExtraPath] = useState('');
  const [legacy, setLegacy] = useState((prefill?.pages.legacy ?? []).join('\n'));
  const [flags, setFlags] = useState<Record<Flag, boolean>>(prefill?.policy ? (Object.fromEntries(FLAGS.map((f) => [f.key, prefill.policy![f.key]])) as Record<Flag, boolean>) : defaultFlags());
  const [expectedIds, setExpectedIds] = useState((prefill?.policy?.expectedIds ?? []).join(', '));
  const [manual, setManual] = useState<string[]>(prefill?.policy?.manualItems.map((i) => i.key) ?? MANUAL_ITEMS.map((i) => i.key));

  const typedPath = normalisePath(extraPath);
  // A path typed but not yet added still counts: the visitor should not have to know about the Add button.
  const selected = [...new Set([...pages.filter((p) => p.selected).map((p) => p.path), ...(typedPath ? [typedPath] : [])])];
  const limit = mode === 'comparison' ? limits.comparisonPages : limits.policyPages;
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
    if (!typedPath) return;
    setPages((list) => (list.some((p) => p.path === typedPath)
      ? list.map((p) => (p.path === typedPath ? { ...p, selected: true } : p))
      : [...list, { path: typedPath, selected: true }]));
    setExtraPath('');
  };

  const missing = !targetUrl.trim() ? (mode === 'comparison' ? 'Enter the new site’s address.' : 'Enter the address of the site to check.')
    : mode === 'comparison' && !baselineUrl.trim() ? 'Enter the current site’s address.'
    : !selected.length ? 'Choose at least one page: tick one in the list, or type a path and press Add.'
    : selected.length > limit ? `Choose at most ${limit} pages.`
    : null;

  const submit = () => {
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
    }, {
      onSuccess: ({ runId }) => navigate(`/tracking-check/${runId}`),
      onError: (e) => toast.error(e.message),
    });
  };

  return (
    <Card>
      <CardHeader><CardTitle>New Tracking Check</CardTitle></CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="What do you want to check?">
          {MODES.map((m) => (
            <Button key={m.mode} type="button" role="radio" aria-checked={mode === m.mode} variant={mode === m.mode ? 'default' : 'outline'} className="h-auto flex-col items-start whitespace-normal py-3 text-left" onClick={() => setMode(m.mode)}>
              <span className="font-semibold">{m.title}</span>
              <span className="text-xs font-normal opacity-80">{m.text}</span>
            </Button>
          ))}
        </div>

        {mode === 'comparison' && (
          <div className="space-y-2">
            <Label htmlFor="tc-baseline">Current site (how it should behave)</Label>
            <Input id="tc-baseline" placeholder="https://www.example.com" value={baselineUrl} onChange={(e) => setBaselineUrl(e.target.value)} />
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="tc-target">{mode === 'comparison' ? 'New site (for example the staging address)' : 'Site to check'}</Label>
 <Input id="tc-target" placeholder={mode === 'comparison' ? 'https://staging.example.com' : 'https://www.example.com'} value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)} />
        </div>

        <p className="text-xs text-muted-foreground">The site must be reachable without a password. Password-protected (basic auth) sites are not supported yet.</p>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <Label>Pages to test ({selected.length} of max {limit})</Label>
            <Button type="button" variant="outline" size="sm" disabled={!sourceUrl || suggest.isPending} onClick={loadPages}>
              {suggest.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}Suggest from sitemap
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">The homepage is a good start. Add pages with forms (contact, demo), or click Suggest from sitemap to choose from the site's pages.</p>
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
            <Input aria-label="Add a page path" placeholder="Type a page path, then press Add" value={extraPath} onChange={(e) => setExtraPath(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addPath(); } }} />
            <Button type="button" variant="outline" onClick={addPath}>Add</Button>
          </div>
        </div>

        {mode === 'comparison' && (
          <div className="space-y-2">
            <Label htmlFor="tc-legacy">Old addresses that change on the new site (optional, one per line)</Label>
            <p className="text-xs text-muted-foreground">We check that each one redirects on the new site and keeps UTM and click IDs.</p>
            <Textarea id="tc-legacy" rows={3} placeholder={'/product/\n/in-depth/'} value={legacy} onChange={(e) => setLegacy(e.target.value)} />
          </div>
        )}

        {mode === 'policy' && (
          <Collapsible>
          <CollapsibleTrigger asChild><Button variant="link" className="h-auto p-0">Advanced: what to check and expected IDs</Button></CollapsibleTrigger>
          <CollapsibleContent className="mt-3 space-y-3">
            <p className="text-xs text-muted-foreground">The report lists the ticked commitments and checks the site against them. Untick what does not apply to the site.</p>
            <Label>Commitments to check</Label>
            {FLAGS.map((f) => (
              <label key={f.key} className="flex items-start gap-2 text-sm">
                <Checkbox checked={flags[f.key]} onCheckedChange={(v) => setFlags({ ...flags, [f.key]: v === true })} />
                <span>{f.label}{f.hint && <span className="block text-xs text-muted-foreground">{f.hint}</span>}</span>
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
          </CollapsibleContent>
          </Collapsible>
        )}

        <div className="space-y-2">
          <Button className="w-full" disabled={!!missing || create.isPending} aria-describedby={missing ? 'tc-missing' : undefined} onClick={submit}>
            {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
            Start check · about {minutes} min
          </Button>
          {missing && <p id="tc-missing" className="text-center text-sm text-muted-foreground">{missing}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
