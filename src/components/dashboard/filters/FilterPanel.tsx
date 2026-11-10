// src/components/dashboard/filters/FilterPanel.tsx
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Bookmark, Trash2 } from 'lucide-react';
import { DateRangePicker } from '@/components/dashboard/DateRangePicker';
import { useDashboardFilters } from '@/contexts/DashboardFiltersContext';
import { useSavedFilters } from '@/hooks/useSavedFilters';
import { useUTMSegments } from '@/contexts/UTMSegmentContext';
import { useTopPaths } from '@/hooks/useTopPaths';
import { BUILTIN_SEGMENTS, SEGMENT_PRESETS, builtinSegment, builtinSegmentId } from '@/lib/dashboard/builtinSegments';
import { normalizePath, presetRange } from '@/lib/dashboard/filters';

const toIso = (d: Date) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString().slice(0, 10);
const ALL = '__all__';

export function FilterPanel({ siteId }: { siteId: string }) {
  const { filters, setFilters, dateRange } = useDashboardFilters();
  const { saved, save, remove } = useSavedFilters(siteId);
  const { segments } = useUTMSegments();
  const { data: topPaths = [] } = useTopPaths(siteId, filters.from, filters.to);
  const [pathDraft, setPathDraft] = useState(filters.path ?? '');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  // A segment id from the URL that no longer exists is treated as "All".
  const activeBuiltin = builtinSegment(filters.segmentId);
  const segmentValue = activeBuiltin || segments.some((s) => s.id === filters.segmentId) ? filters.segmentId! : ALL;

  // Values are "segment:<id>" (date range plus built-in segment, keeps URL) or "saved:<id>".
  // Plain date presets live in the date picker.
  const applyQuick = (value: string) => {
    const [kind, id] = [value.slice(0, value.indexOf(':')), value.slice(value.indexOf(':') + 1)];
    if (kind === 'segment') {
      const p = SEGMENT_PRESETS.find((x) => x.id === id);
      if (p) setFilters({ ...presetRange(p.range, new Date()), segmentId: builtinSegmentId(p.segment) });
      return;
    }
    const s = saved.find((x) => x.id === id);
    if (!s) return;
    const to = new Date();
    const from = new Date(to.getTime() - ((s.filters.rangeDays ?? 30) - 1) * 86_400_000);
    setFilters({ from: toIso(from), to: toIso(to), path: s.filters.path, segmentId: s.filters.segmentId });
    setPathDraft(s.filters.path ?? '');
  };

  return (
    <aside aria-label="Filters" className="space-y-4 rounded-lg border bg-card p-3">
      <DateRangePicker compact dateRange={dateRange}
        onDateRangeChange={(r) => { if (r?.from && r?.to) setFilters({ from: toIso(r.from), to: toIso(r.to) }); }} />

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Quick filter</Label>
        <Select value="" onValueChange={applyQuick}>
          <SelectTrigger className="h-8"><SelectValue placeholder="Choose a filter" /></SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Segment</SelectLabel>
              {SEGMENT_PRESETS.map((p) => <SelectItem key={p.id} value={`segment:${p.id}`}>{p.label}</SelectItem>)}
            </SelectGroup>
            {saved.length > 0 && (
              <SelectGroup>
                <SelectLabel>Saved</SelectLabel>
                {saved.map((s) => <SelectItem key={s.id} value={`saved:${s.id}`}>{s.name}</SelectItem>)}
              </SelectGroup>
            )}
          </SelectContent>
        </Select>
        {saved.map((s) => (
          <div key={s.id} className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="truncate">{s.name}</span>
            <Button variant="ghost" size="icon" className="h-6 w-6" aria-label={`Delete ${s.name}`} onClick={() => remove(s.id)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="filter-path" className="text-xs text-muted-foreground">Website URL</Label>
        <Input id="filter-path" className="h-8" placeholder="All URLs — e.g. /pricing" value={pathDraft}
          title="Matches pages that start with this path. Suggestions are the most viewed pages in the date range."
          onChange={(e) => {
            setPathDraft(e.target.value);
            // Picking a suggestion from the list applies it straight away.
            if (topPaths.some((p) => p.path === e.target.value)) setFilters({ path: e.target.value });
          }}
          onBlur={() => setFilters({ path: normalizePath(pathDraft) })}
          onKeyDown={(e) => { if (e.key === 'Enter') setFilters({ path: normalizePath(pathDraft) }); }}
          list="filter-path-suggestions" autoComplete="off" />
        <datalist id="filter-path-suggestions">
          {topPaths.map((p) => <option key={p.path} value={p.path}>{`${p.views} page views`}</option>)}
        </datalist>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Segment</Label>
        <Select value={segmentValue} onValueChange={(v) => setFilters({ segmentId: v === ALL ? null : v })}>
          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All visits</SelectItem>
            <SelectGroup>
              <SelectLabel>Built-in</SelectLabel>
              {BUILTIN_SEGMENTS.map((b) => <SelectItem key={b.key} value={builtinSegmentId(b.key)}>{b.label}</SelectItem>)}
            </SelectGroup>
            {segments.length > 0 && (
              <SelectGroup>
                <SelectLabel>UTM segments</SelectLabel>
                {segments.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectGroup>
            )}
          </SelectContent>
        </Select>
        {activeBuiltin && <p className="text-xs text-muted-foreground">{activeBuiltin.description}</p>}
      </div>

      {saving ? (
        <form className="flex gap-2"
          onSubmit={async (e) => { e.preventDefault(); if (name.trim()) { await save(name, filters); setName(''); setSaving(false); } }}>
          <Input aria-label="Filter name" className="h-8" maxLength={80} placeholder="Name" autoFocus
            value={name} onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') setSaving(false); }} />
          <Button type="submit" size="sm" disabled={!name.trim()}>Save</Button>
        </form>
      ) : (
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => setSaving(true)}>
          <Bookmark className="mr-1.5 h-3.5 w-3.5" /> Save current filter
        </Button>
      )}
    </aside>
  );
}
