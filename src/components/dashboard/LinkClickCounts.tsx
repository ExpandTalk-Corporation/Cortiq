import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Link as LinkIcon, MousePointer } from 'lucide-react';
import { useLinkClickCounts } from '@/hooks/useLinkClickCounts';

interface LinkClickCountsProps {
  siteId: string | null;
}

export function LinkClickCounts({ siteId }: LinkClickCountsProps) {
  const [days, setDays] = useState(30);
  const { rows, loading, error } = useLinkClickCounts(siteId, days);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <LinkIcon className="h-5 w-5" /> Link clicks (aggregate)
          </CardTitle>
          <Select value={days.toString()} onValueChange={(v) => setDays(parseInt(v))}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 days</SelectItem>
              <SelectItem value="30">30 days</SelectItem>
              <SelectItem value="90">90 days</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="text-sm text-muted-foreground">
          Anonymous per-link tallies. Works in cookieless mode without consent.
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
        ) : error ? (
          <p className="text-sm text-destructive">Error: {error}</p>
        ) : rows.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <MousePointer className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No link clicks recorded for this period yet.</p>
          </div>
        ) : (
          <div className="grid gap-2">
            {rows.slice(0, 20).map((r, i) => (
              <div key={i} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{r.link_label || r.link_key}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    <Badge variant="outline" className="mr-2 text-[10px]">{r.link_kind}</Badge>
                    {r.link_key} · {r.page_path}
                  </p>
                </div>
                <div className="text-right ml-4">
                  <div className="text-lg font-bold">{r.total_clicks}</div>
                  <div className="text-xs text-muted-foreground">
                    {r.desktop_clicks}d / {r.mobile_clicks}m / {r.tablet_clicks}t
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default LinkClickCounts;
