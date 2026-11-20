import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MessageSquareQuote } from 'lucide-react';
import { useReportedChannel, useReportedChannelConfig, isReportedChannelConfigured } from '@/hooks/useReportedChannel';
import { formatCount, formatShare, mismatches, mismatchLabel, reportedLabel, MIN_RANGE_DAYS } from '@/lib/reportedChannel';
import type { Site } from '@/types/dashboard';

/**
 * Attribution layer 1.5: what buyers say ("how did you hear about us?") next to the observed source of
 * the converting visit. Aggregate only; counts of 1–4 are shown as "fewer than 5" (with a second count
 * hidden where needed), totals are rounded to 5, and every percentage has its count next to it.
 */
export function ReportedChannelCard({ selectedSite, onNavigate }: { selectedSite: Site; onNavigate?: (tab: string) => void }) {
  const { data: config, isLoading: configLoading } = useReportedChannelConfig(selectedSite.id);
  const configured = isReportedChannelConfigured(config);
  const { data, isLoading, error, tooShort } = useReportedChannel(configured ? selectedSite.id : '');

  const settingsLink = onNavigate && (
    <button type="button" className="underline" onClick={() => onNavigate('integrations')}>
      Settings → Integrations
    </button>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <MessageSquareQuote className="h-4 w-4 text-blue-500" />
          Self-reported source
          <Badge variant="outline" className="text-xs font-normal">Recall, not fact</Badge>
        </CardTitle>
        <CardDescription className="text-xs">
          What buyers say when a form asks &quot;how did you hear about us?&quot;, next to where the converting visit came from.
          Answers are recall, not fact: people tend to name the last touch they remember.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 text-sm">
        {configLoading && <p className="text-muted-foreground">Loading self-reported source...</p>}
        {!configLoading && !configured && (
          <p className="text-xs text-muted-foreground">
            Not set up. Map the answers of a &quot;how did you hear about us?&quot; question (a HubSpot property or a select or
            radio field on your form) to categories, and update your banner and privacy texts first. {settingsLink}
          </p>
        )}
        {configured && tooShort && (
          <p className="text-xs text-muted-foreground">
            Pick a date range of at least {MIN_RANGE_DAYS} days to see self-reported source. Shorter ranges are not shown, so
            single answers cannot be worked out by comparing ranges.
          </p>
        )}
        {configured && !tooShort && isLoading && <p className="text-muted-foreground">Loading self-reported source...</p>}
        {configured && error && <p className="text-muted-foreground">Self-reported source could not be loaded.</p>}
        {configured && data && (
          <>
            <div>
              <div className="font-medium mb-1">Answer rate</div>
              <p className="text-xs text-muted-foreground">
                {formatShare(data.answered, data.conversions)} conversions in this period have an answer. Only conversions from
                consented visits can carry one{config?.hubspotProperty ? ', and the HubSpot path also needs marketing consent and a matching email' : ''},
                so the rate is usually low.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Answers are counted only when the visitor made the consent choice in the same visit.
              </p>
            </div>

            {data.answered.n === 0 && !data.answered.lt5 ? (
              <p className="text-xs text-muted-foreground">No answers in this period yet.</p>
            ) : (
              <>
                <div>
                  <div className="font-medium mb-2">What buyers say</div>
                  <div className="space-y-1">
                    <div className="flex gap-3 text-xs text-muted-foreground">
                      <div className="flex-1">Answer</div>
                      <div className="w-40 text-right">Answers (share of answers)</div>
                    </div>
                    {data.reported.map((r) => (
                      <div key={r.channel} className="flex gap-3 text-xs">
                        <div className="flex-1">{reportedLabel(r.channel)}</div>
                        <div className="w-40 text-right">{formatShare(r, data.answered)}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="font-medium mb-1">Answer vs. observed source</div>
                  <p className="text-xs text-muted-foreground mb-2">
                    {formatShare(data.matched, data.answered)} answers name the same channel the converting visit came from.
                    The rest are where what buyers say and what analytics sees differ.
                  </p>
                  {mismatches(data).length > 0 && (
                    <div className="space-y-1">
                      {mismatches(data).map((c) => (
                        <div key={`${c.reported}-${c.observed}`} className="flex gap-3 text-xs">
                          <div className="flex-1">{mismatchLabel(c)}</div>
                          <div className="w-40 text-right">{formatShare(c, data.answered)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            <p className="text-xs text-muted-foreground">
              Counts are suppressed or rounded to protect individual answers: counts of 1–4 are shown as
              &quot;{formatCount({ n: null, lt5: true })}&quot;, where that alone would let the number be worked out a second count
              is &quot;{formatCount({ n: null, lt5: false, hidden: true })}&quot;, and totals are rounded to the nearest 5, so
              percentages are approximate. One answer per visit and category, not a journey.
              The category stays in CortIQ: it is not sent to Google Ads, Google Analytics or AI insights.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
