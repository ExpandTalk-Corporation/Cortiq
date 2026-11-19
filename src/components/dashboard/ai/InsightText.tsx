// Insight text with fact tokens: each {{mN}} shows the server-computed value; clicking or focusing it
// opens the fact's label, source, period, formula and row count (spec 2026-11-19 §3.4).
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatFact, splitTokens, type Fact } from '../../../../supabase/functions/_shared/insight-facts.ts';

export function InsightText({ text, facts }: { text: string; facts: Fact[] | null | undefined }) {
  const parts = splitTokens(text);
  if (parts.length === 1 && typeof parts[0] === 'string') return <>{text}</>;
  return (
    <>
      {parts.map((part, i) => {
        if (typeof part === 'string') return <span key={i}>{part}</span>;
        if (facts === undefined) return <span key={i} className="text-muted-foreground">…</span>;
        const fact = facts?.find((f) => f.id === part.id);
        return (
          <Popover key={i}>
            <PopoverTrigger asChild>
              <button type="button" className="underline decoration-dotted underline-offset-2 font-medium text-foreground">
                {fact ? formatFact(fact) : '—'}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-72 text-xs space-y-1">
              {fact ? (
                <>
                  <p className="font-medium">{fact.label}</p>
                  <p className="text-muted-foreground">Source: {fact.source}</p>
                  <p className="text-muted-foreground">Period: {fact.period.from} to {fact.period.to}</p>
                  <p className="text-muted-foreground">Formula: {fact.formula}</p>
                  <p className="text-muted-foreground">Rows: {fact.rows.toLocaleString('en-US')}</p>
                </>
              ) : (
                <p className="text-muted-foreground">Fact not found. The data behind this number is no longer available.</p>
              )}
            </PopoverContent>
          </Popover>
        );
      })}
    </>
  );
}
