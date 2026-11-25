import { ArrowDown, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { STATE_LABEL, consentJourney, type JourneyStep, type VendorRow } from '../../../supabase/functions/_shared/tracking-check/report.ts';
import type { FindingStatus } from '../../../supabase/functions/_shared/tracking-check/types.ts';
import { CATEGORY_ORDER, CATEGORY_STYLE, STATUS } from './status';

export const JOURNEY_NOTE = 'Each step is a separate visit in a fresh browser, so the steps show what each choice leads to, not a timed recording of one visit. A tool counts when it sent requests or stored data on at least one tested page.';

interface Props { rows: VendorRow[]; findings: { checkKey: string; status: FindingStatus }[]; onShow: (checkKey: string) => void }

/** The tested consent states as steps: what runs before the visitor chooses, then after each choice. */
export function ConsentJourney({ rows, findings, onShow }: Props) {
  const steps = consentJourney(rows, findings);
  const first = steps.find((s) => s.state === 'none');
  const choices = steps.filter((s) => s.state !== 'none');
  if (!steps.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Consent journey</CardTitle>
        <p className="text-sm text-muted-foreground">{JOURNEY_NOTE}</p>
        <CategoryLegend />
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-3 md:flex-row md:items-stretch">
          {first && <div className="md:w-1/3"><Step step={first} onShow={onShow} /></div>}
          {first && choices.length > 0 && (
            <div className="flex items-center justify-center text-muted-foreground" aria-hidden>
              <ArrowDown className="h-5 w-5 md:hidden" /><ArrowRight className="hidden h-5 w-5 md:block" />
            </div>
          )}
          {choices.length > 0 && (
            <div className="flex-1 space-y-2">
              {first && <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Then the visitor chooses</p>}
              <div className={`grid gap-3 ${choices.length > 1 ? 'sm:grid-cols-2' : ''}`}>
                {choices.map((s) => <Step key={s.state} step={s} onShow={onShow} />)}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function CategoryLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-xs text-muted-foreground" aria-label="Tool categories">
      {CATEGORY_ORDER.map((c) => (
        <li key={c} className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${CATEGORY_STYLE[c].dot}`} aria-hidden />{CATEGORY_STYLE[c].label}</li>
      ))}
    </ul>
  );
}

function Step({ step, onShow }: { step: JourneyStep; onShow: (checkKey: string) => void }) {
  const flagged = step.tools.filter((t) => t.status === 'fail' || t.status === 'warning').length;
  const counts = CATEGORY_ORDER.filter((c) => step.byCategory[c]).map((c) => `${step.byCategory[c]} ${CATEGORY_STYLE[c].label.toLowerCase()}`);
  const tools = [...step.tools].sort((a, b) => Number(!!b.status) - Number(!!a.status) || CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category));
  return (
    <section className={`h-full rounded-lg border p-3 ${flagged ? 'border-red-500/40' : ''}`}>
      <h3 className="font-medium">{STATE_LABEL[step.state]}</h3>
      <p className="mb-2 text-sm text-muted-foreground">
        {step.tools.length
          ? `${step.tools.length} ${step.tools.length === 1 ? 'tool' : 'tools'} active: ${counts.join(', ')}`
          : 'No tracking tools seen'}
      </p>
      {tools.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {tools.map((t) => {
            const s = t.status ? STATUS[t.status] : null;
            const Icon = s?.icon;
            const label = (
              <>
                {s && Icon
                  ? <Icon className={`h-3.5 w-3.5 shrink-0 ${s.className}`} role="img" aria-label={s.label} />
                  : <span className={`h-2 w-2 shrink-0 rounded-full ${CATEGORY_STYLE[t.category].dot}`} aria-hidden />}
                <span className="min-w-0">
                  {t.name}
                  {t.stored.length > 0 && <span className="text-muted-foreground"> · {t.stored.slice(0, 2).join(', ')}{t.stored.length > 2 ? ` +${t.stored.length - 2}` : ''}</span>}
                </span>
              </>
            );
            const chip = `inline-flex max-w-full items-center gap-1.5 whitespace-normal break-words rounded-xl border px-2 py-0.5 text-left text-xs ${CATEGORY_STYLE[t.category].badge}`;
            return (
              <li key={t.id} className="max-w-full" title={`${CATEGORY_STYLE[t.category].label}${t.stored.length ? ` · stores ${t.stored.join(', ')}` : ''}`}>
                {t.findingKey
                  ? <Button variant="ghost" className={`h-auto ${chip} hover:opacity-80`} onClick={() => onShow(t.findingKey!)}>{label}</Button>
                  : <span className={chip}>{label}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
