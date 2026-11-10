/**
 * Custom dimensions: report on properties sent with CortIQ.track().
 *
 * Keys are discovered from the site's events in the selected range; registering one makes it
 * a dimension with a value breakdown. Rows include "(other)" so they add up to the total.
 */

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { ExportButton } from './ExportButton';
import { useDashboardFilters } from '@/contexts/DashboardFiltersContext';
import {
  MAX_CUSTOM_DIMENSIONS,
  useCustomDimensionBreakdown,
  useCustomDimensionList,
  useCustomDimensionMutations,
  useEventPropertyKeys,
} from '@/hooks/useCustomDimensions';

interface CustomDimensionsProps {
  siteId: string;
}

const EXAMPLE = `CortIQ.track('conversion', 'signup', { plan: 'pro', seats: 5 });`;

/** Properties the tracking script adds to every event by itself, explained in plain words. */
const BUILT_IN_PROPERTIES: Record<string, { label: string; splits: string }> = {
  traffic_segment: {
    label: 'Traffic segment',
    splits: 'Splits events into "public" (marketing pages) and "authenticated" (pages under the logged-in path, /admin by default; set data-auth-path on the script tag to change it). Use it to separate product usage from marketing traffic.',
  },
  visitor_type: {
    label: 'Visitor type',
    splits: 'Splits events into "human", "ai_agent", "bot" and "unknown", as classified when the visitor was identified.',
  },
  device_type: {
    label: 'Device type',
    splits: 'Splits events into desktop, mobile and tablet.',
  },
  timezone: {
    label: 'Time zone',
    splits: 'Splits events by the browser time zone, e.g. Europe/Stockholm. A rough stand-in for region without IP lookup.',
  },
  referrer: {
    label: 'Referrer',
    splits: 'Splits events by the full referring URL. Usually many values; Traffic sources is easier to read.',
  },
};

export function CustomDimensions({ siteId }: CustomDimensionsProps) {
  const { filters } = useDashboardFilters();
  const { data: dimensions = [] } = useCustomDimensionList(siteId);
  const { data: keys = [], isLoading: keysLoading } = useEventPropertyKeys(siteId);
  const { register, remove } = useCustomDimensionMutations(siteId);

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [newKey, setNewKey] = useState('');
  const [newLabel, setNewLabel] = useState('');

  useEffect(() => {
    if (!dimensions.some((d) => d.key === selectedKey)) setSelectedKey(dimensions[0]?.key ?? null);
  }, [dimensions, selectedKey]);

  const { data: rows = [], isLoading: rowsLoading } = useCustomDimensionBreakdown(siteId, selectedKey);
  const total = useMemo(() => rows.reduce((sum, r) => sum + Number(r.events), 0), [rows]);
  const unregistered = keys.filter((k) => !k.registered);
  const selected = dimensions.find((d) => d.key === selectedKey);
  const atLimit = dimensions.length >= MAX_CUSTOM_DIMENSIONS;

  function handleRegister() {
    if (!newKey) return;
    register.mutate(
      { key: newKey, label: newLabel },
      {
        onSuccess: () => {
          toast.success(`"${newKey}" registered`);
          setSelectedKey(newKey);
          setNewKey('');
          setNewLabel('');
        },
        onError: () => toast.error('Could not register the dimension'),
      },
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Custom dimensions</CardTitle>
        <CardDescription>
          Split your events by a property. 1) Pick a property below: some are added by the tracking script
          automatically, others are ones you send with <code>CortIQ.track()</code>. 2) Register it. 3) The table shows
          events and sessions per value. Up to {MAX_CUSTOM_DIMENSIONS} per site. Identifiers such as visitor ID, URL and
          user agent cannot be registered. Never send names, email addresses or other personal data as properties.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {dimensions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {dimensions.map((d) => (
              <Badge
                key={d.id}
                variant={d.key === selectedKey ? 'default' : 'outline'}
                className="pl-3 pr-1 py-1.5 cursor-pointer"
                onClick={() => setSelectedKey(d.key)}
              >
                {d.label}
                {d.label !== d.key && <span className="ml-1 opacity-60 font-mono text-xs">{d.key}</span>}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 ml-1"
                  aria-label={`Remove ${d.label}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    remove.mutate(d.id, { onError: () => toast.error('Could not remove the dimension') });
                  }}
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            ))}
          </div>
        )}

        {unregistered.length > 0 && !atLimit ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select value={newKey} onValueChange={(k) => { setNewKey(k); if (!newLabel || Object.values(BUILT_IN_PROPERTIES).some((b) => b.label === newLabel)) setNewLabel(BUILT_IN_PROPERTIES[k]?.label ?? ''); }}>
              <SelectTrigger className="sm:w-64">
                <SelectValue placeholder="Property seen in events..." />
              </SelectTrigger>
              <SelectContent>
                {unregistered.map((k) => (
                  <SelectItem key={k.key} value={k.key}>
                    {BUILT_IN_PROPERTIES[k.key] && <span className="mr-2">{BUILT_IN_PROPERTIES[k.key].label}</span>}
                    <span className="font-mono text-xs">{k.key}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{Number(k.events).toLocaleString()} events</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              className="sm:w-56"
              placeholder="Label (optional)"
              maxLength={60}
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
            />
            <Button onClick={handleRegister} disabled={!newKey || register.isPending}>
              Register
            </Button>
          </div>
        ) : null}
        {newKey && BUILT_IN_PROPERTIES[newKey] && (
          <p className="text-sm text-muted-foreground">{BUILT_IN_PROPERTIES[newKey].splits}</p>
        )}
        {unregistered.length > 0 && !atLimit ? null : !keysLoading && keys.length === 0 ? (
          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground space-y-2">
            <p>No custom properties in events for this period. Send them as the third argument:</p>
            <pre className="overflow-x-auto rounded bg-muted p-2 text-xs"><code>{EXAMPLE}</code></pre>
          </div>
        ) : atLimit ? (
          <p className="text-sm text-muted-foreground">Limit of {MAX_CUSTOM_DIMENSIONS} dimensions reached.</p>
        ) : null}

        {selected && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium">{selected.label}</h3>
                <p className="text-sm text-muted-foreground">
                  {BUILT_IN_PROPERTIES[selected.key]?.splits ?? <>Events split by the value of <code>{selected.key}</code>.</>}
                </p>
              </div>
              <ExportButton
                config={{
                  reportType: 'custom-dimension',
                  data: rows.map((r) => ({ [selected.key]: r.value, events: r.events, sessions: r.sessions })),
                  siteId,
                  dateRange: { from: filters.from, to: filters.to },
                  filename: `dimension-${selected.key}`,
                }}
                size="sm"
                variant="outline"
              />
            </div>
            {rowsLoading ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Loading...</p>
            ) : rows.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No events with <code>{selected.key}</code> in this period.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Value</TableHead>
                    <TableHead className="text-right">Events</TableHead>
                    <TableHead className="text-right">Sessions</TableHead>
                    <TableHead className="text-right">Share of events</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={`${r.is_other}-${r.value}`}>
                      <TableCell className={r.is_other ? 'italic text-muted-foreground' : 'font-mono text-sm break-all'}>
                        {r.value}
                      </TableCell>
                      <TableCell className="text-right">{Number(r.events).toLocaleString()}</TableCell>
                      <TableCell className="text-right">{Number(r.sessions).toLocaleString()}</TableCell>
                      <TableCell className="text-right">
                        {total > 0 ? `${((Number(r.events) / total) * 100).toFixed(1)}%` : '–'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <p className="text-xs text-muted-foreground">
              Counts events that carry the property (consent-based tracking only). The top 25 values are shown;
              the rest are grouped as "(other)". Values longer than 100 characters are cut.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
