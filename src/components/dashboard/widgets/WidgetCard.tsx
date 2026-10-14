// src/components/dashboard/widgets/WidgetCard.tsx
import { useRef, type ReactNode } from 'react';
import { FileDown, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toCsv, downloadCsv } from '@/lib/csv';
import { printWidget } from '@/lib/printWidget';

export type WidgetExport = { filename: string; columns: string[]; rows: unknown[][] };

export function WidgetCard({ title, subtitle, exportData, actions, children }: {
  title: string; subtitle?: string; exportData?: () => WidgetExport; actions?: ReactNode; children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <section ref={ref} className="rounded-lg border bg-card p-5">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{title}</h3>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        <div data-widget-toolbar className="flex gap-1">
          {actions}
          {exportData && (
            <Button variant="ghost" size="icon" aria-label={`Export ${title} as CSV`} title="Export CSV"
              onClick={() => { const e = exportData(); downloadCsv(e.filename, toCsv(e.columns, e.rows)); }}>
              <FileDown className="h-4 w-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon" aria-label={`Print or save ${title} as PDF`} title="Print / PDF"
            onClick={() => ref.current && printWidget(ref.current, title)}>
            <Printer className="h-4 w-4" />
          </Button>
        </div>
      </header>
      {children}
    </section>
  );
}
