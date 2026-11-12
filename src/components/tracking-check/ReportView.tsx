import { useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, Copy, Hand, HelpCircle, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { FindingStatus, Mode } from '../../../supabase/functions/_shared/tracking-check/types.ts';
import { MATRIX_MANUAL_NOTE, MATRIX_NOTE, ORIGIN_SHORT, OWNER_LABEL, STATE_LABEL, cellText, matrixStates, type ReportSummary, type VendorRow } from '../../../supabase/functions/_shared/tracking-check/report.ts';
import type { DiffItem, RunDiff } from '../../../supabase/functions/_shared/tracking-check/diff.ts';
import type { FindingRow } from '@/hooks/useTrackingCheck';

const STATUS: Record<FindingStatus, { label: string; icon: typeof XCircle; className: string }> = {
  fail: { label: 'Problem', icon: XCircle, className: 'text-red-600 dark:text-red-400' },
  warning: { label: 'Review', icon: AlertTriangle, className: 'text-amber-600 dark:text-amber-400' },
  manual: { label: 'Test manually', icon: Hand, className: 'text-blue-600 dark:text-blue-400' },
  untestable: { label: 'Not tested', icon: HelpCircle, className: 'text-muted-foreground' },
  pass: { label: 'OK', icon: CheckCircle2, className: 'text-green-600 dark:text-green-400' },
};
const anchor = (checkKey: string) => `finding-${checkKey.replace(/[^a-zA-Z0-9_-]/g, '-')}`;

interface ReportViewProps {
  summary: ReportSummary;
  findings: FindingRow[];
  mode: Mode;
  baselineUrl: string | null;
  targetUrl: string;
  finishedAt: string | null;
  actions?: ReactNode;
  onVerify?: (finding: FindingRow, verified: boolean) => void;
  /** Start with the list of all checks collapsed (the landing page sample). */
  collapsed?: boolean;
}

export function ReportView({ summary, findings, mode, baselineUrl, targetUrl, finishedAt, actions, onVerify, collapsed = false }: ReportViewProps) {
  const [open, setOpen] = useState<string | null>(null);
  // The summary lists at most 3 problems and 2 items to review; say how many more the list below holds.
  const hidden = summary.counts.fail + summary.counts.warning - summary.lines.filter((l) => l.status !== 'pass').length;
  const [listOpen, setListOpen] = useState(!collapsed);
  const showFix = (checkKey: string) => {
    setListOpen(true);
    setOpen(checkKey);
    requestAnimationFrame(() => document.getElementById(anchor(checkKey))?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <p className="text-sm text-muted-foreground">
            {mode === 'comparison' ? `${baselineUrl} → ${targetUrl}` : `${targetUrl} · consent policy`}
            {finishedAt && ` · ${new Date(finishedAt).toLocaleString()}`}
          </p>
          <CardTitle className="text-2xl">{summary.headline}</CardTitle>
          {summary.commitments && (
            <p className="text-sm text-muted-foreground">
              {summary.commitments.length
                ? <>Checked against: {summary.commitments.join('; ')}. A problem breaks one of these commitments, or a consent rule that always applies, such as nothing stored on the device before the visitor chooses.</>
                : 'No commitments were ticked: findings show what the site does, not whether it meets a policy.'}
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {summary.lines.map((line) => {
            const s = STATUS[line.status];
            const Icon = s.icon;
            return (
              <div key={line.checkKey} className="flex items-start gap-3">
                <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${s.className}`} role="img" aria-label={s.label} />
                <p className="flex-1">{line.text}</p>
                {line.status !== 'pass' && (
                  <Button variant="link" className="h-auto p-0" onClick={() => showFix(line.checkKey)}>Show fix</Button>
                )}
              </div>
            );
          })}
          {hidden > 0 && (
            <p className="text-sm text-muted-foreground">+{hidden} more to fix or review in the list below</p>
          )}
          {actions && <div className="flex flex-wrap gap-2 pt-2">{actions}</div>}
        </CardContent>
      </Card>

      {summary.diff && <ChangesCard diff={summary.diff} onShow={showFix} />}

      {summary.vendors && summary.vendors.length > 0 && <VendorTable rows={summary.vendors} onShow={showFix} />}

      <Collapsible open={listOpen} onOpenChange={setListOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="gap-2 px-0"><ChevronDown className={`h-4 w-4 transition-transform ${listOpen ? '' : '-rotate-90'}`} aria-hidden />All {findings.length} checks</Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 divide-y rounded-md border">
          {findings.map((f) => (
            <FindingItem key={f.id ?? f.checkKey} finding={f} open={open === f.checkKey}
              onToggle={() => setOpen(open === f.checkKey ? null : f.checkKey)} onVerify={onVerify} />
          ))}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

// Scheduled runs: what changed since the previous run of the same schedule. Older runs have no diff.
function ChangesCard({ diff, onShow }: { diff: RunDiff; onShow: (checkKey: string) => void }) {
  const c = diff.counts;
  const since = diff.previousFinishedAt ? new Date(diff.previousFinishedAt).toLocaleDateString() : 'the previous run';
  const none = c.newProblems + c.resolved + c.notTested + c.newVendors + c.removedVendors + c.newCookies === 0;
  const more = (shown: number, total: number) => total > shown && <p className="text-sm text-muted-foreground">+{total - shown} more</p>;
  const items = (list: DiffItem[], total: number, showFix: boolean) => (
    <>
      <ul className="space-y-2">
        {list.map((i) => {
          const s = STATUS[i.status];
          const Icon = s.icon;
          return (
            <li key={i.checkKey} className="flex items-start gap-3">
              <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${s.className}`} role="img" aria-label={s.label} />
              <span className="flex-1">
                {i.title}
                {i.previous && i.previous !== i.status && <span className="text-sm text-muted-foreground"> (was {STATUS[i.previous].label})</span>}
              </span>
              {showFix && <Button variant="link" className="h-auto p-0" onClick={() => onShow(i.checkKey)}>Show fix</Button>}
            </li>
          );
        })}
      </ul>
      {more(list.length, total)}
    </>
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Changes since {since}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {none
            ? 'Nothing changed since the previous scheduled check.'
            : [
              `${c.newProblems} new ${c.newProblems === 1 ? 'problem' : 'problems'}`,
              `${c.resolved} resolved`,
              `${c.unchanged} unchanged`,
              c.notTested ? `${c.notTested} not tested this time` : '',
              c.newVendors ? `${c.newVendors} new ${c.newVendors === 1 ? 'tool' : 'tools'}` : '',
              c.newCookies ? `${c.newCookies} new ${c.newCookies === 1 ? 'cookie' : 'cookies'}` : '',
            ].filter(Boolean).join(' · ')}
        </p>
      </CardHeader>
      {!none && (
        <CardContent className="space-y-4">
          {diff.newProblems.length > 0 && <section className="space-y-2"><h3 className="font-medium">New problems</h3>{items(diff.newProblems, c.newProblems, true)}</section>}
          {(diff.newVendors.length > 0 || diff.newCookies.length > 0) && (
            <section className="space-y-1">
              <h3 className="font-medium">New tools and cookies</h3>
              {diff.newVendors.length > 0 && <p className="text-sm">New tools: {diff.newVendors.map((v) => v.name).join(', ')}{c.newVendors > diff.newVendors.length && ` +${c.newVendors - diff.newVendors.length} more`}</p>}
              {diff.newCookies.length > 0 && <p className="text-sm">New cookies or storage: {diff.newCookies.map((k) => `${k.name} (${k.vendor})`).join(', ')}{c.newCookies > diff.newCookies.length && ` +${c.newCookies - diff.newCookies.length} more`}</p>}
            </section>
          )}
          {diff.resolved.length > 0 && <section className="space-y-2"><h3 className="font-medium">Resolved</h3>{items(diff.resolved, c.resolved, false)}</section>}
          {diff.notTested.length > 0 && <section className="space-y-2"><h3 className="font-medium">Not tested this time</h3>{items(diff.notTested, c.notTested, true)}</section>}
          {diff.removedVendors.length > 0 && <p className="text-sm text-muted-foreground">No longer seen: {diff.removedVendors.map((v) => v.name).join(', ')}</p>}
        </CardContent>
      )}
    </Card>
  );
}

function VendorTable({ rows, onShow }: { rows: VendorRow[]; onShow: (checkKey: string) => void }) {
  const states = matrixStates(rows);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">By tool</CardTitle>
        <p className="text-sm text-muted-foreground">{MATRIX_NOTE}</p>
        <p className="text-sm text-muted-foreground">{MATRIX_MANUAL_NOTE}</p>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2 pr-3 font-medium">Tool</th>
              {states.map((s) => <th key={s} className="py-2 pr-3 font-medium">{STATE_LABEL[s]}</th>)}
              <th className="py-2 font-medium">Loaded by</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const s = r.status ? STATUS[r.status] : null;
              const Icon = s?.icon;
              const key = r.findings[0];
              return (
                <tr key={r.id} className="border-b align-top last:border-0">
                  <td className="py-2 pr-3">
                    <div className="flex items-start gap-2">
                      {s && Icon && <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${s.className}`} role="img" aria-label={s.label} />}
                      {key && r.status !== 'pass'
                        ? <Button variant="link" className="h-auto p-0 text-left font-medium" onClick={() => onShow(key)}>{r.name}</Button>
                        : <span className="font-medium">{r.name}</span>}
                    </div>
                  </td>
                  {states.map((st) => <td key={st} className="py-2 pr-3">{cellText(r.states[st])}</td>)}
                  <td className="py-2 text-muted-foreground">{r.origin ? ORIGIN_SHORT[r.origin] : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

interface FindingItemProps { finding: FindingRow; open: boolean; onToggle: () => void; onVerify?: (finding: FindingRow, verified: boolean) => void }

function FindingItem({ finding: f, open, onToggle, onVerify }: FindingItemProps) {
  const s = STATUS[f.status];
  const Icon = s.icon;
  return (
    <div id={anchor(f.checkKey)} className="p-4">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-start gap-3 text-left">
        <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${s.className}`} role="img" aria-label={s.label} />
        <span className="flex-1 font-medium">{f.title}</span>
        <Badge variant="outline" className="hidden sm:inline-flex">{f.scope}</Badge>
        {f.priority && f.status !== 'pass' && <Badge variant={f.priority === 'high' ? 'destructive' : 'secondary'}>{f.priority}</Badge>}
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open && (
        <div className="mt-3 space-y-3 pl-8 text-sm">
          {f.explanation && <p>{f.explanation}</p>}
          {f.fix && (
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="font-medium">What to do</span>
                <Button size="sm" variant="ghost" onClick={() => navigator.clipboard.writeText(f.fix)}><Copy className="mr-1 h-3 w-3" aria-hidden />Copy</Button>
              </div>
              <pre className="whitespace-pre-wrap rounded bg-muted p-3 font-mono text-xs">{f.fix}</pre>
            </div>
          )}
          {f.typicalOwner && <p className="text-muted-foreground">Usually owned by: {OWNER_LABEL[f.typicalOwner]}</p>}
          {(f.evidence.pages.length > 0 || f.evidence.details.length > 0) && (
            <div className="text-muted-foreground">
              <p className="font-medium text-foreground">Evidence</p>
              {f.evidence.pages.length > 0 && <p>Pages: {f.evidence.pages.join(', ')}</p>}
              {f.evidence.details.length > 0 && <ul className="list-disc pl-5">{f.evidence.details.map((d) => <li key={d}>{d}</li>)}</ul>}
            </div>
          )}
          {f.status === 'manual' && onVerify && (
            <label className="flex items-center gap-2">
              <Checkbox checked={!!f.verifiedAt} onCheckedChange={(v) => onVerify(f, v === true)} />
              Verified manually{f.verifiedAt && ` (${new Date(f.verifiedAt).toLocaleDateString()})`}
            </label>
          )}
          {f.status === 'manual' && !onVerify && f.verifiedAt && <p>Verified manually on {new Date(f.verifiedAt).toLocaleDateString()}</p>}
        </div>
      )}
    </div>
  );
}
