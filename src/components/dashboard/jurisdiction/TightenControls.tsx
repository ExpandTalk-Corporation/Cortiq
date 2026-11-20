import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PURPOSES } from '@/lib/jurisdiction';
import type { Purpose } from '@/lib/jurisdiction';

// The customer can only tighten here — relaxing goes through jurisdiction_exceptions (phase 4,
// the customer's own documented assessment; never for hard floors). This list is the only thing the control can write, matching the
// site_jurisdiction_tighten CHECK (opt_in, off).
const CHOICES = ['opt_in', 'off'] as const;
const LABEL: Record<string, string> = { opt_in: 'Require opt-in', off: 'Off', default: 'CortIQ default' };

export function TightenControls({ tighten, onChange }: { tighten: Partial<Record<Purpose, string>>; onChange: (p: Purpose, o: 'opt_in' | 'off' | null) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {PURPOSES.map((p) => (
        <div key={p} className="space-y-1">
          <Label>{p.replace(/_/g, ' ')}</Label>
          <Select value={tighten[p] ?? 'default'} onValueChange={(v) => onChange(p, v === 'default' ? null : (v as 'opt_in' | 'off'))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="default">{LABEL.default}</SelectItem>
              {CHOICES.map((c) => <SelectItem key={c} value={c}>{LABEL[c]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      ))}
    </div>
  );
}
