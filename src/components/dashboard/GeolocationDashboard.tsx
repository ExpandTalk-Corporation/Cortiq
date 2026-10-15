/**
 * Locations tab: sessions per visitor country.
 *
 * Country is the ISO code Cloudflare reports for the request (CF-IPCountry), stamped on
 * the session by track-event → ingest_pageview. No IP, region or city is stored, so the
 * map shows one marker per country at its geographic centre.
 */

import { useMemo } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ExportButton } from './ExportButton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Globe, MapPin, TrendingUp, Eye } from 'lucide-react';
import GeolocationMap, { type MapCluster, type HeatmapPoint } from './GeolocationMap';
import { useGeoBreakdown, type GeoRow } from '@/hooks/useGeoBreakdown';
import { useDashboardFilters } from '@/contexts/DashboardFiltersContext';
import { COUNTRY_CENTROIDS } from '@/lib/countryCentroids';

interface GeolocationDashboardProps {
  siteId: string;
}

const regionNames = (() => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' });
  } catch {
    return null;
  }
})();

function countryLabel(code: string | null): string {
  if (!code) return 'Unknown';
  try {
    return regionNames?.of(code) ?? code;
  } catch {
    return code;
  }
}

function conversionRate(row: GeoRow): number {
  return row.sessions > 0 ? (row.conversions / row.sessions) * 100 : 0;
}

export function GeolocationDashboard({ siteId }: GeolocationDashboardProps) {
  const { filters } = useDashboardFilters();
  const { data: rows = [], isLoading, error } = useGeoBreakdown(siteId);

  const known = useMemo(() => rows.filter((r) => r.country_code), [rows]);
  const totalSessions = rows.reduce((sum, r) => sum + r.sessions, 0);
  const totalPageViews = rows.reduce((sum, r) => sum + r.page_views, 0);
  const knownSessions = known.reduce((sum, r) => sum + r.sessions, 0);
  const coverage = totalSessions > 0 ? (knownSessions / totalSessions) * 100 : 0;

  const markers = useMemo<MapCluster[]>(
    () =>
      known.flatMap((r) => {
        const c = COUNTRY_CENTROIDS[r.country_code!];
        return c
          ? [{ label: countryLabel(r.country_code), latitude: c[0], longitude: c[1],
               sessions: r.sessions, page_views: r.page_views, conversions: r.conversions }]
          : [];
      }),
    [known],
  );

  const heatPoints = useMemo<HeatmapPoint[]>(() => {
    const max = Math.max(...markers.map((m) => m.sessions), 1);
    return markers.map((m) => ({
      latitude: m.latitude,
      longitude: m.longitude,
      intensity: Math.max(1, Math.round((m.sessions / max) * 100)),
    }));
  }, [markers]);

  const exportRows = rows.map((r) => ({
    country_code: r.country_code ?? '',
    country: countryLabel(r.country_code),
    sessions: r.sessions,
    page_views: r.page_views,
    bounce_rate: r.bounce_rate,
    avg_duration_seconds: r.avg_duration,
    conversions: r.conversions,
    conversion_rate: Number(conversionRate(r).toFixed(2)),
  }));

  const emptyState = (
    <div className="text-center py-8 text-muted-foreground">
      <Globe className="h-12 w-12 mx-auto mb-3 opacity-50" />
      <p>{error ? 'Failed to load location data' : 'No country data for this period yet'}</p>
      {!error && (
        <p className="text-xs mt-1">
          Country is recorded on new sessions from 2026-10-15; earlier sessions show as Unknown.
        </p>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Globe className="h-4 w-4" />
              Countries
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{known.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Sessions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalSessions.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Page Views
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalPageViews.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Country Known
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{coverage.toFixed(0)}%</div>
            <p className="text-xs text-muted-foreground mt-1">of sessions in period</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="map">
        <TabsList>
          <TabsTrigger value="map">Map View</TabsTrigger>
          <TabsTrigger value="heatmap">Heatmap</TabsTrigger>
          <TabsTrigger value="table">Table</TabsTrigger>
        </TabsList>

        <TabsContent value="map" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                World Map
              </CardTitle>
              <CardDescription>Sessions per country, one marker per country</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="w-full h-96 rounded-lg border overflow-hidden">
                <GeolocationMap data={markers} heatmapData={[]} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="heatmap" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Visitor Density Heatmap</CardTitle>
              <CardDescription>Relative session volume per country</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="w-full h-96 rounded-lg border overflow-hidden">
                <GeolocationMap data={[]} heatmapData={heatPoints} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="table" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Countries</CardTitle>
                <ExportButton
                  config={{
                    reportType: 'geolocation',
                    data: exportRows,
                    siteId,
                    dateRange: { from: filters.from, to: filters.to },
                    filename: 'geolocation-country',
                  }}
                  size="sm"
                  variant="outline"
                />
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading location data...</div>
              ) : known.length === 0 ? (
                emptyState
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Country</TableHead>
                      <TableHead className="text-right">Sessions</TableHead>
                      <TableHead className="text-right">Page Views</TableHead>
                      <TableHead className="text-right">Bounce Rate</TableHead>
                      <TableHead className="text-right">Conv. Rate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.country_code ?? 'unknown'}>
                        <TableCell>
                          <span className={r.country_code ? 'font-medium' : 'text-muted-foreground'}>
                            {countryLabel(r.country_code)}
                          </span>
                          {r.country_code && (
                            <span className="ml-2 text-xs text-muted-foreground">{r.country_code}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">{r.sessions.toLocaleString()}</TableCell>
                        <TableCell className="text-right">{r.page_views.toLocaleString()}</TableCell>
                        <TableCell className="text-right">{Number(r.bounce_rate).toFixed(1)}%</TableCell>
                        <TableCell className="text-right font-medium">
                          {conversionRate(r).toFixed(2)}%
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
