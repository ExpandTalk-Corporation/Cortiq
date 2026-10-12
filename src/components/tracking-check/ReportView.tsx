import { useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, Copy, Hand, HelpCircle, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { FindingStatus, Mode, Owner } from '../../../supabase/functions/_shared/tracking-check/types.ts';
import type { ReportSummary } from '../../../supabase/functions/_shared/tracking-check/report.ts';
import type { FindingRow } from '@/hooks/useTrackingCheck';

const STATUS: Record<FindingStatus, { label: string; icon: typeof XCircle; className: string }> = {
  fail: { label: 'Problem', icon: XCircle, className: 'text-red-600 dark:text-red-400' },
  warning: { label: 'Review', icon: AlertTriangle, className: 'text-amber-600 dark:text-amber-400' },
  manual: { label: 'Test manually', icon: Hand, className: 'text-blue-600 dark:text-blue-400' },
  untestable: { label: 'Not tested', icon: HelpCircle, className: 'text-muted-foreground' },
  pass: { label: 'OK', icon: CheckCircle2, className: 'text-green-600 dark:text-green-400' },
};
const OWNER: Record<Owner, string> = {
  developer: 'Developer', gtm: 'Tag manager (GTM)', cmp: 'Cookie banner (CMP)', marketing: 'Marketing', legal: 'Controller / legal',
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
}

export function ReportView({ summary, findings, mode, baselineUrl, targetUrl, finishedAt, actions, onVerify }: ReportViewProps) {
  const [open, setOpen] = useState<string | null>(null);
  const showFix = (checkKey: string) => {
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
          {actions && <div className="flex flex-wrap gap-2 pt-2">{actions}</div>}
        </CardContent>
      </Card>

      <Collapsible defaultOpen>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="gap-2 px-0"><ChevronDown className="h-4 w-4" aria-hidden />All {findings.length} checks</Button>
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

interface FindingItemProps { finding: FindingRow; open: boolean; onToggle: () => void; onVerify?: (finding: FindingRow, verified: boolean) => void }

function FindingItem({ finding: f, open, onToggle, onVerify }: FindingItemProps) {
  const s = STATUS[f.status];
  const Icon = s.icon;
  return (
    <div id={anchor(f.checkKey)} className="p-4">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-start gap-3 text-left">
        <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${s.className}`} role="img" aria-label={s.label} />
        <span className="flex-1 font-medium">{f.title}</span>
        <Badge variant="outline">{f.scope}</Badge>
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
          {f.typicalOwner && <p className="text-muted-foreground">Usually owned by: {OWNER[f.typicalOwner]}</p>}
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
