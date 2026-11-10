// src/components/dashboard/tabs/AdsTab.tsx
// One Ads tab with two sources:
// - CortIQ: visits recorded by the tracking script with a paid utm_medium (paid-ads-analytics).
// - GA4: paid sessions and ad cost read from Google Analytics 4 (ga4-kpi-dashboard).
// The source lives in the URL (?source=cortiq|ga4). Without it, the old ?tab=paid-ads-server
// link opens CortIQ; otherwise GA4 is shown when connected.
import { useSearchParams } from 'react-router-dom';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useAcquisitionReadiness } from '@/hooks/useAcquisitionReadiness';
import { PaidAdsTab } from './PaidAdsTab';
import { ServerSidePaidAdsTab } from './ServerSidePaidAdsTab';

export type AdsSource = 'cortiq' | 'ga4';

interface AdsTabProps {
  selectedSite: string;
  startDate?: string;
  endDate?: string;
  onNavigate?: (tab: string) => void;
}

export function AdsTab({ selectedSite, startDate, endDate, onNavigate }: AdsTabProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: readiness, isLoading } = useAcquisitionReadiness(selectedSite);

  const fromUrl = searchParams.get('source');
  const source: AdsSource | null =
    fromUrl === 'cortiq' || fromUrl === 'ga4' ? fromUrl
      : searchParams.get('tab') === 'paid-ads-server' ? 'cortiq'
      : isLoading ? null : readiness?.ga4Connected ? 'ga4' : 'cortiq';

  // Clicking the active item deselects it in a single ToggleGroup ('' arrives); keep the source.
  const setSource = (value: string) => {
    if (value !== 'cortiq' && value !== 'ga4') return;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('source', value);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Ads</h2>
          <p className="text-sm text-muted-foreground">
            {source === 'ga4'
              ? 'Paid sessions and ad cost from Google Analytics 4.'
              : 'Visits recorded by CortIQ whose landing link has a paid utm_medium.'}
          </p>
        </div>
        <ToggleGroup type="single" variant="outline" size="sm" value={source ?? ''} onValueChange={setSource} aria-label="Data source">
          <ToggleGroupItem value="cortiq">CortIQ</ToggleGroupItem>
          <ToggleGroupItem value="ga4" title={readiness && !readiness.ga4Connected ? 'No GA4 property connected yet' : undefined}>
            Google Analytics 4{readiness && !readiness.ga4Connected && <span className="ml-1 text-muted-foreground">(not connected)</span>}
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {source === null ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading...</div>
      ) : source === 'ga4' ? (
        <PaidAdsTab selectedSite={selectedSite} onNavigate={onNavigate} />
      ) : (
        <ServerSidePaidAdsTab selectedSite={selectedSite} startDate={startDate} endDate={endDate} onNavigate={onNavigate} />
      )}
    </div>
  );
}
