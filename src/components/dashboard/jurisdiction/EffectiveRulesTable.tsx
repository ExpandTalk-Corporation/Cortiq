import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { effectiveByMarket } from '@/lib/effectiveByMarket';
import type { CustomerProfile, Purpose } from '@/lib/jurisdiction';

const OUTCOME_LABEL: Record<string, string> = {
  allowed: 'Allowed', allowed_unless_opt_out: 'Unless the visitor objects', needs_opt_in: 'Opt-in required', blocked: 'Off',
};

export function EffectiveRulesTable({ customer, tighten }: { customer: CustomerProfile | null; tighten: Partial<Record<Purpose, string>> }) {
  const rows = useMemo(() => effectiveByMarket({ customer, tighten }), [customer, tighten]);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="text-left text-muted-foreground"><th className="py-1 pr-3">Market</th><th className="pr-3">Purpose</th><th className="pr-3">Outcome</th><th>Basis</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.market}-${r.purpose}`} className="border-t">
              <td className="py-1 pr-3 uppercase">{r.market.replace('_', ' ')}</td>
              <td className="pr-3">{r.purpose.replace(/_/g, ' ')}</td>
              <td className="pr-3">{OUTCOME_LABEL[r.outcome]}</td>
              <td>{r.status === 'baseline' ? <Badge variant="outline">Baseline</Badge> : <Badge variant="secondary">{r.ruleIds.join(', ')}</Badge>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
