import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sparkles } from 'lucide-react';
import { useAiInfluence } from '@/hooks/useAiInfluence';
import { aiInfluenceTotals, aiReadShare, brandClickShare } from '@/lib/aiInfluence';
import { BOT_VENDORS } from '@/lib/aiBotRegistry';
import type { Site } from '@/types/dashboard';

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div className="text-2xl font-bold">{value.toLocaleString('en')}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

/** Attribution layer 2: what AI assistants did with the site, next to conversions and brand search. Signals, not credit. */
export function AiInfluenceCard({ selectedSite, onNavigate }: { selectedSite: Site; onNavigate?: (tab: string) => void }) {
  const { data, isLoading, error } = useAiInfluence(selectedSite.id);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-purple-500" />
          AI influence
          <Badge variant="outline" className="text-xs font-normal">Signal, not credit</Badge>
        </CardTitle>
        <CardDescription className="text-xs">
          What AI assistants did with your pages in this period. Most of a buying journey happens off your site; these are the
          parts CortIQ can see that other analytics tools do not.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 text-sm">
        {isLoading && <p className="text-muted-foreground">Loading AI influence...</p>}
        {error && <p className="text-muted-foreground">AI influence could not be loaded.</p>}
        {data && (() => {
          const totals = aiInfluenceTotals(data);
          const share = aiReadShare(data.conversions);
          return (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Stat value={totals.agentic} label="Pages fetched by an AI assistant for a user" />
                <Stat value={totals.citation} label="Pages read by AI search crawlers" />
                <Stat value={totals.referrals} label={data.aggregate ? 'Visits from AI assistants (all visits)' : 'Visits from AI assistants (consented visits)'} />
              </div>

              <div>
                <div className="font-medium mb-1">Conversions on pages AI assistants read</div>
                {share === null ? (
                  <p className="text-xs text-muted-foreground">No conversions in this period, so there is nothing to compare yet.</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {data.conversions.onAiReadPages} of {data.conversions.total} conversions ({share} %) happened on a page an AI assistant
                    or AI search crawler read in the {data.windowDays} days before. This is a correlation, not a cause: the visitor may
                    never have seen the AI answer.
                  </p>
                )}
              </div>

              {data.pages.length > 0 && (
                <div>
                  <div className="font-medium mb-2">Pages AI assistants read most</div>
                  <div className="space-y-1">
                    <div className="flex gap-3 text-xs text-muted-foreground">
                      <div className="flex-1">Page</div>
                      <div className="w-16 text-right">For users</div>
                      <div className="w-16 text-right">AI search</div>
                      <div className="w-20 text-right">Conversions</div>
                    </div>
                    {data.pages.map((p) => (
                      <div key={p.path} className="flex gap-3 text-xs">
                        <div className="flex-1 truncate" title={p.path}>{p.path}</div>
                        <div className="w-16 text-right">{p.agentic}</div>
                        <div className="w-16 text-right">{p.citation}</div>
                        <div className="w-20 text-right">{p.conversions}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {data.assistants.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {data.assistants.map((a) => (
                    <Badge key={a.botType} variant="secondary" className="text-xs font-normal">
                      {BOT_VENDORS[a.botType] ?? a.botType}: {a.agentic + a.citation}
                    </Badge>
                  ))}
                </div>
              )}

              <div>
                <div className="font-medium mb-1">Brand search (Search Console)</div>
                {data.brand === null ? (
                  <p className="text-xs text-muted-foreground">
                    Add brand keywords to see brand searches next to AI activity. People who meet you in an AI answer often search
                    for your name later.{' '}
                    {onNavigate && (
                      <button type="button" className="underline" onClick={() => onNavigate('integrations')}>
                        Settings → Integrations
                      </button>
                    )}
                  </p>
                ) : data.brand.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No Search Console data for this period.</p>
                ) : (
                  <div className="space-y-1">
                    {data.brand.map((b) => {
                      const s = brandClickShare(b);
                      return (
                        <div key={b.periodStart} className="flex gap-3 text-xs">
                          <div className="w-44 text-muted-foreground">{b.periodStart} – {b.periodEnd}</div>
                          <div className="flex-1">
                            {b.brandClicks} brand clicks · {b.otherClicks} other clicks
                            {s !== null && <span className="text-muted-foreground"> ({s} % brand)</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <p className="text-xs text-muted-foreground">
                Training crawlers are left out: they do not send visitors. An AI answer that names you without fetching a page or
                sending a click is not visible to CortIQ or any other analytics tool.
              </p>
            </>
          );
        })()}
      </CardContent>
    </Card>
  );
}
