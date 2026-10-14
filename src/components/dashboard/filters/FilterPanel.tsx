// src/components/dashboard/filters/FilterPanel.tsx
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2 } from 'lucide-react';
import { DateRangePicker } from '@/components/dashboard/DateRangePicker';
import { useDashboardFilters } from '@/contexts/DashboardFiltersContext';
import { useSavedFilters } from '@/hooks/useSavedFilters';
import { useUTMSegments } from '@/contexts/UTMSegmentContext';
import { normalizePath } from '@/lib/dashboard/filters';

const toIso = (d: Date) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString().slice(0, 10);
const ALL = '__all__';

export function FilterPanel({ siteId }: { siteId: string }) {
  const { filters, setFilters, dateRange } = useDashboardFilters();
  const { saved, save, remove } = useSavedFilters(siteId);
  const { segments } = useUTMSegments();
  const [pathDraft, setPathDraft] = useState(filters.path ?? '');
  const [name, setName] = useState('');

  // A segment id from the URL that no longer exists is treated as "All".
  const segmentValue = segments.some((s) => s.id === filters.segmentId) ? filters.segmentId! : ALL;

  const applySaved = (id: string) => {
    const s = saved.find((x) => x.id === id);
    if (!s) return;
    const to = new Date();
    const from = new Date(to.getTime() - ((s.filters.rangeDays ?? 30) - 1) * 86_400_000);
    setFilters({ from: toIso(from), to: toIso(to), path: s.filters.path, segmentId: s.filters.segmentId });
    setPathDraft(s.filters.path ?? '');
  };

  return (
    <aside aria-label="Filters" className="space-y-6 rounded-lg border bg-card p-4">
      <h2 className="text-lg font-semibold">Filter</h2>

      <div className="space-y-2">
        <Label>Saved filter</Label>
        <Select onValueChange={applySaved}>
          <SelectTrigger><SelectValue placeholder={saved.length ? 'Choose a saved filter' : 'No saved filters'} /></SelectTrigger>
          <SelectContent>
            {saved.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {saved.map((s) => (
          <div key={s.id} className="flex items-center justify-between text-sm text-muted-foreground">
            <span className="truncate">{s.name}</span>
            <Button variant="ghost" size="icon" aria-label={`Delete ${s.name}`} onClick={() => remove(s.id)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <Label htmlFor="filter-path">Website URL</Label>
        <Input id="filter-path" placeholder="All URLs — e.g. /pricing" value={pathDraft}
          onChange={(e) => setPathDraft(e.target.value)}
          onBlur={() => setFilters({ path: normalizePath(pathDraft) })}
          onKeyDown={(e) => { if (e.key === 'Enter') setFilters({ path: normalizePath(pathDraft) }); }} />
        <p className="text-xs text-muted-foreground">Matches pages that start with this path.</p>
      </div>

      <div className="space-y-2">
        <Label>Date range</Label>
        <DateRangePicker dateRange={dateRange}
          onDateRangeChange={(r) => { if (r?.from && r?.to) setFilters({ from: toIso(r.from), to: toIso(r.to) }); }} />
      </div>

      <div className="space-y-2">
        <Label>Segment</Label>
        <Select value={segmentValue} onValueChange={(v) => setFilters({ segmentId: v === ALL ? null : v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All visits</SelectItem>
            {segments.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <form className="space-y-2 border-t pt-4"
        onSubmit={async (e) => { e.preventDefault(); if (name.trim()) { await save(name, filters); setName(''); } }}>
        <Label htmlFor="filter-name">Save current filter</Label>
        <div className="flex gap-2">
          <Input id="filter-name" maxLength={80} placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <Button type="submit" disabled={!name.trim()}>Save</Button>
        </div>
      </form>
    </aside>
  );
}
