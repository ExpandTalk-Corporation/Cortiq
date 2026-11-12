// src/components/dashboard/overview/DataCoverage.tsx
import { AlertTriangle, CalendarRange } from 'lucide-react';
import { useDataCoverage } from '@/hooks/useDataCoverage';
import { coverageLine, gapWarnings } from '@/lib/dataCoverage';

/** Which days of the selected range have page views, with a warning for each tracking gap. */
export function DataCoverage({ siteId, from, to }: { siteId: string; from: string; to: string }) {
  const { data } = useDataCoverage(siteId, from, to);
  if (!data) return null;
  const warnings = gapWarnings(data);
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <CalendarRange className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {coverageLine(data)}
      </p>
      {warnings.length > 0 && (
        <div role="alert" className="space-y-1 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
          {warnings.map((w) => (
            <p key={w} className="flex gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
              <span>{w}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
