import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Server, Bot, Search, Globe, Eye, HelpCircle, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

interface Props {
  siteId: string;
  days?: number;
}

interface TrafficSummary {
  total: number;
  by_type: Record<string, number>;
  top_bots: { name: string; count: number }[];
  top_countries: { country: string; count: number }[];
}

const TYPE_META: Record<string, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  human:          { label: 'Human',         color: '#22c55e', icon: Eye },
  search_crawler: { label: 'Search bots',   color: '#3b82f6', icon: Search },
  ai_bot:         { label: 'AI bots',       color: '#a855f7', icon: Bot },
  scraper:        { label: 'Scrapers',      color: '#ef4444', icon: AlertCircle },
  monitoring:     { label: 'Monitoring',    color: '#f59e0b', icon: Server },
  unknown:        { label: 'Unknown',       color: '#6b7280', icon: HelpCircle },
};

function pct(n: number, total: number) {
  if (!total) return 0;
  return Math.round((n / total) * 100);
}

export function CloudflareTrafficWidget({ siteId, days = 7 }: Props) {
  const [summary, setSummary]   = useState<TrafficSummary | null>(null);
  const [loading, setLoading]   = useState(true);
  const [showBots, setShowBots] = useState(false);
  const [notSetup, setNotSetup] = useState(false);

  useEffect(() => {
    if (!siteId) return;
    setLoading(true);

    supabase
      .rpc('get_cloudflare_traffic_summary', { p_site_id: siteId, p_days: days })
      .then(({ data, error }) => {
        if (error) { setNotSetup(true); setLoading(false); return; }
        const s = data as TrafficSummary;
        if (!s || s.total === 0) { setNotSetup(true); }
        else { setSummary(s); }
        setLoading(false);
      });
  }, [siteId, days]);

  const pieData = summary
    ? Object.entries(summary.by_type)
        .filter(([, n]) => n > 0)
        .map(([type, value]) => ({
          name:  TYPE_META[type]?.label ?? type,
          value,
          color: TYPE_META[type]?.color ?? '#6b7280',
        }))
    : [];

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center justify-center h-40">
          <p className="text-sm text-muted-foreground animate-pulse">Loading server-side traffic…</p>
        </CardContent>
      </Card>
    );
  }

  if (notSetup) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Server className="h-4 w-4 text-primary" />
            Server-Side Traffic (Cloudflare)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-dashed p-4 space-y-2">
            <p className="text-sm font-medium">Worker not connected yet</p>
            <p className="text-xs text-muted-foreground">
              Install the Cloudflare Worker to see all traffic — including bots that never run JavaScript.
            </p>
            <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
              <li>Copy <code className="bg-muted px-1 rounded">/cloudflare-worker.js</code> from the project</li>
              <li>Create a Worker in Cloudflare dashboard and paste the code</li>
              <li>Add env var <code className="bg-muted px-1 rounded">CORTIQ_SITE_KEY</code> = your tracking key (tk_…)</li>
              <li>Add route <code className="bg-muted px-1 rounded">yourdomain.com/*</code></li>
            </ol>
            <p className="text-xs text-muted-foreground">
              The current Worker reports AI crawlers to the AI-bot views (server-side agent measurement); this card
              shows data from Workers set up with the older ingest key.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const humanCount   = summary!.by_type['human'] ?? 0;
  const humanPct     = pct(humanCount, summary!.total);
  const botCount     = summary!.total - humanCount;
  const botPct       = 100 - humanPct;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Server className="h-4 w-4 text-primary" />
            Server-Side Traffic
            <Badge variant="outline" className="text-xs font-normal">Last {days}d</Badge>
          </CardTitle>
          <div className="flex gap-3 text-sm">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-green-500 inline-block" />
              <span className="font-semibold">{humanPct}%</span>
              <span className="text-muted-foreground">human</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-red-400 inline-block" />
              <span className="font-semibold">{botPct}%</span>
              <span className="text-muted-foreground">bot</span>
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex items-center gap-6">
          {/* Donut */}
          <div className="shrink-0">
            <ResponsiveContainer width={110} height={110}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={30}
                  outerRadius={50}
                  dataKey="value"
                  strokeWidth={2}
                >
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number) => [value.toLocaleString('sv-SE'), '']}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Breakdown bars */}
          <div className="flex-1 space-y-2 min-w-0">
            {Object.entries(summary!.by_type)
              .sort(([, a], [, b]) => b - a)
              .map(([type, count]) => {
                const meta = TYPE_META[type] ?? TYPE_META.unknown;
                const Icon = meta.icon;
                const p = pct(count, summary!.total);
                return (
                  <div key={type} className="space-y-0.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Icon className="h-3 w-3" style={{ color: meta.color }} />
                        {meta.label}
                      </span>
                      <span className="font-medium tabular-nums">
                        {count.toLocaleString('sv-SE')}
                        <span className="text-muted-foreground ml-1">({p}%)</span>
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${p}%`, backgroundColor: meta.color }}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        {/* Total count */}
        <div className="flex items-center justify-between text-xs text-muted-foreground border-t pt-3">
          <span>Total server requests (excl. assets)</span>
          <span className="font-semibold text-foreground tabular-nums">
            {summary!.total.toLocaleString('sv-SE')}
          </span>
        </div>

        {/* Top bots collapsible */}
        {summary!.top_bots.length > 0 && (
          <div>
            <button
              onClick={() => setShowBots(v => !v)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {showBots ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {showBots ? 'Hide' : 'Show'} top bots
            </button>
            {showBots && (
              <div className="mt-2 space-y-1">
                {summary!.top_bots.map((bot, i) => (
                  <div key={i} className="flex justify-between text-xs">
                    <span className="text-muted-foreground truncate max-w-[200px]">{bot.name}</span>
                    <span className="tabular-nums font-medium">{bot.count.toLocaleString('sv-SE')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
