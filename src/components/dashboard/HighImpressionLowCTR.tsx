import { useState } from 'react';
import { useHighImpressionLowCTR } from '@/hooks/useHighImpressionLowCTR';
import { useDashboardFilters } from '@/contexts/DashboardFiltersContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Eye, ExternalLink } from 'lucide-react';

interface Props {
  siteId: string;
}

const IMPRESSION_THRESHOLDS = [
  { label: '>100 exp', value: 100 },
  { label: '>500 exp', value: 500 },
  { label: '>1 000 exp', value: 1000 },
  { label: '>5 000 exp', value: 5000 },
];

const CTR_THRESHOLDS = [
  { label: 'CTR < 0,05 %', value: 0.0005 },
  { label: 'CTR < 0,5 %',  value: 0.005  },
  { label: 'CTR < 1 %',    value: 0.01   },
  { label: 'CTR < 2 %',    value: 0.02   },
];

function fmtCtr(ctr: number) {
  return `${(ctr * 100).toFixed(2)} %`;
}

function fmtUrl(url: string, max = 52) {
  try {
    const path = new URL(url).pathname;
    return path.length > max ? path.slice(0, max) + '…' : path || '/';
  } catch {
    return url.length > max ? url.slice(0, max) + '…' : url;
  }
}

export function HighImpressionLowCTR({ siteId }: Props) {
  const [minImp, setMinImp] = useState(500);
  const [maxCtr, setMaxCtr] = useState(0.005);
  const { filters } = useDashboardFilters();
  const { data: pages, isLoading } = useHighImpressionLowCTR(siteId, { from: filters.from, to: filters.to }, minImp, maxCtr);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Eye className="h-4 w-4 text-orange-400" /> High impressions, low CTR
            </CardTitle>
            <CardDescription className="mt-1">
              Pages Google shows often but users rarely click — prime targets for title/description optimisation.
              Uses the latest Search Console sync that overlaps the selected period.
            </CardDescription>
          </div>
          <div className="flex gap-2 shrink-0">
            <Select value={String(minImp)} onValueChange={v => setMinImp(Number(v))}>
              <SelectTrigger className="h-8 text-xs w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {IMPRESSION_THRESHOLDS.map(t => (
                  <SelectItem key={t.value} value={String(t.value)}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(maxCtr)} onValueChange={v => setMaxCtr(Number(v))}>
              <SelectTrigger className="h-8 text-xs w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CTR_THRESHOLDS.map(t => (
                  <SelectItem key={t.value} value={String(t.value)}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-4 space-y-2">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
          </div>
        ) : !pages || pages.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            No pages match the current thresholds in the selected period.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground text-xs">
                  <th className="text-left px-4 py-2 font-medium">Page</th>
                  <th className="text-right px-4 py-2 font-medium w-28">Impressions</th>
                  <th className="text-right px-4 py-2 font-medium w-20">Clicks</th>
                  <th className="text-right px-4 py-2 font-medium w-20">CTR</th>
                  <th className="text-right px-4 py-2 font-medium w-20">Position</th>
                </tr>
              </thead>
              <tbody>
                {pages.map(page => (
                  <tr key={page.url} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-2.5">
                      <a
                        href={page.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-blue-400 hover:underline max-w-xs"
                        title={page.url}
                      >
                        <span className="truncate">{fmtUrl(page.url)}</span>
                        <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
                      </a>
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium">
                      {page.impressions.toLocaleString('sv-SE')}
                    </td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">
                      {page.clicks.toLocaleString('sv-SE')}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Badge
                        variant="outline"
                        className={`text-xs ${page.ctr < 0.001 ? 'border-red-500/40 text-red-400' : 'border-orange-500/40 text-orange-400'}`}
                      >
                        {fmtCtr(page.ctr)}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">
                      {page.position.toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
