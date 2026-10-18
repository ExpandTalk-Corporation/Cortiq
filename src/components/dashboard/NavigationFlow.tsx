/**
 * Navigation flow: how visitors move between pages, from the page views already collected
 * per session (get_navigation_flow). Reloads of the same page are not counted as a step.
 */
import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowRight, LogIn, LogOut, Route } from 'lucide-react';
import { useNavigationFlow } from '@/hooks/useNavigationFlow';

function PathList({ title, icon, rows, empty }: {
  title: string; icon: ReactNode; rows: { path: string; sessions: number }[]; empty: string;
}) {
  const max = Math.max(...rows.map((r) => r.sessions), 1);
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">{icon}{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ul className="space-y-2">
            {rows.slice(0, 10).map((r) => (
              <li key={r.path} className="text-sm">
                <div className="flex justify-between gap-3">
                  <span className="font-mono truncate" title={r.path}>{r.path}</span>
                  <span className="tabular-nums text-muted-foreground">{r.sessions.toLocaleString()}</span>
                </div>
                <div className="mt-1 h-1.5 rounded bg-muted">
                  <div className="h-1.5 rounded bg-primary" style={{ width: `${(r.sessions / max) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function NavigationFlow({ siteId }: { siteId: string }) {
  const { data, isLoading, error } = useNavigationFlow(siteId);

  if (isLoading) {
    return <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>;
  }
  if (error || !data) {
    return <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Failed to load navigation flow</CardContent></Card>;
  }

  const share = data.sessions > 0 ? (data.multi_page_sessions / data.sessions) * 100 : 0;
  const outgoing = new Map<string, number>();
  data.transitions.forEach((t) => outgoing.set(t.from, (outgoing.get(t.from) ?? 0) + t.count));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Route className="h-5 w-5" /> Navigation flow</CardTitle>
          <CardDescription>
            How visitors move from page to page, built from the page views of each session in the selected period.
            {' '}{data.multi_page_sessions.toLocaleString()} of {data.sessions.toLocaleString()} sessions
            ({share.toFixed(1)}%) visited more than one page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.transitions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No page-to-page navigation in this period. A flow appears once visitors view more than one page in a session.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>From</TableHead>
                  <TableHead className="w-6" />
                  <TableHead>To</TableHead>
                  <TableHead className="text-right">Times</TableHead>
                  <TableHead className="text-right">Share of next steps</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.transitions.slice(0, 25).map((t) => (
                  <TableRow key={`${t.from}→${t.to}`}>
                    <TableCell className="font-mono text-xs max-w-[16rem] truncate" title={t.from}>{t.from}</TableCell>
                    <TableCell><ArrowRight className="h-3 w-3 text-muted-foreground" /></TableCell>
                    <TableCell className="font-mono text-xs max-w-[16rem] truncate" title={t.to}>{t.to}</TableCell>
                    <TableCell className="text-right tabular-nums">{t.count.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {((t.count / (outgoing.get(t.from) || 1)) * 100).toFixed(0)}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <PathList title="Entry pages" icon={<LogIn className="h-4 w-4" />} rows={data.entries}
          empty="No sessions in this period." />
        <PathList title="Exit pages (multi-page sessions)" icon={<LogOut className="h-4 w-4" />} rows={data.exits}
          empty="No multi-page sessions in this period." />
      </div>
    </div>
  );
}
