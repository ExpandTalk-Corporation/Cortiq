import { ArrowDown, ArrowRight } from "lucide-react";
import { DISCLAIMER } from "@/lib/jurisdiction";
import { SectionHeader } from "./SectionHeader";
import { MarketMapThumbnail } from "./MarketMap";
import { MarketTable, WorksToday } from "./MarketTable";
import { ROUTING_FLOW, ROUTING_ID, ROUTING_OUTCOMES, ROUTING_TODAY_LINE } from "./copy";

// Status per market is computed from the rule engine at build time (MarketTable, MarketMap); nothing here is hand-written.

export function RoutingSection() {
  return (
    <section id={ROUTING_ID} className="py-20 px-4 bg-muted/30 border-b scroll-mt-16">
      <div className="container mx-auto max-w-6xl">
        <SectionHeader
          eyebrow="Routing per country"
          title="One engine checks each request per country and purpose"
          intro="Each request is matched to a market and a purpose, and a versioned rule says what CortIQ would collect. Market rules are logged against real traffic and do not stop data yet. Your own Off already stops data, and GPC does in the places listed below."
        />

        <figure className="mb-12">
          <figcaption className="sr-only">How a request is routed, step by step</figcaption>
          <ol className="grid gap-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_minmax(0,1.3fr)]">
            {ROUTING_FLOW.map((s, i) => (
              <li key={s.step} className="flex flex-col items-center gap-2 lg:flex-row lg:items-stretch">
                <div className="w-full rounded-lg border bg-background p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">{i + 1}. {s.step}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{s.text}</p>
                </div>
                <ArrowRight className="hidden h-4 w-4 shrink-0 self-center text-muted-foreground lg:block" aria-hidden="true" />
                <ArrowDown className="h-4 w-4 text-muted-foreground lg:hidden" aria-hidden="true" />
              </li>
            ))}
            <li className="rounded-lg border bg-background p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">{ROUTING_FLOW.length + 1}. Outcome</p>
              <dl className="mt-1 space-y-2 text-sm">
                {ROUTING_OUTCOMES.map((o) => (
                  <div key={o.outcome}>
                    <dt className="font-medium text-foreground">{o.outcome}</dt>
                    <dd className="text-muted-foreground">{o.text}</dd>
                  </div>
                ))}
              </dl>
            </li>
          </ol>
        </figure>

        <h3 className="text-2xl font-bold text-center mb-2">Markets the engine knows</h3>
        <p className="text-center text-muted-foreground max-w-3xl mx-auto mb-6">{ROUTING_TODAY_LINE}</p>
        <div className="mx-auto mb-6 max-w-2xl">
          <MarketMapThumbnail />
        </div>
        <MarketTable />

        <h3 className="text-2xl font-bold text-center mt-16 mb-6">What works in every market today</h3>
        <WorksToday />
        <p className="mt-6 text-center text-sm text-muted-foreground">{DISCLAIMER}</p>
      </div>
    </section>
  );
}
