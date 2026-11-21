import { ArrowDown, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { SectionHeader } from "./SectionHeader";
import { MarketMapThumbnail } from "./MarketMap";
import { MarketGrid, WorksToday } from "./MarketTable";
import { ROUTING_FLOW, ROUTING_HEADER, ROUTING_ID, ROUTING_LOGGED_LINE, ROUTING_OUTCOMES } from "./copy";

// Status per market is computed from the rule engine at build time (MarketGrid, MarketMap); nothing here is hand-written.
// Short texts only; the full flow, laws and rules are on /markets/. The caveat (logged, not applied) is said once,
// above the market grid, and the disclaimer once, under it.

const Arrow = () => (
  <>
    <ArrowRight className="hidden h-4 w-4 shrink-0 self-center text-muted-foreground lg:block" aria-hidden="true" />
    <ArrowDown className="h-4 w-4 shrink-0 text-muted-foreground lg:hidden" aria-hidden="true" />
  </>
);

export function RoutingSection() {
  return (
    <section id={ROUTING_ID} className="py-20 px-4 bg-muted/30 border-b scroll-mt-16">
      <div className="container mx-auto max-w-6xl">
        <SectionHeader {...ROUTING_HEADER} />

        <figure className="mb-14">
          <figcaption className="sr-only">How a request is routed, step by step</figcaption>
          <ol className="grid gap-2 lg:grid-cols-5">
            {ROUTING_FLOW.map((s, i) => (
              <li key={s.step} className="flex flex-col items-center gap-2 lg:flex-row lg:items-stretch">
                <div className="h-full w-full rounded-lg border bg-background p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">{i + 1}. {s.step}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{s.text}</p>
                </div>
                <Arrow />
              </li>
            ))}
            <li className="h-full rounded-lg border bg-background p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">{ROUTING_FLOW.length + 1}. Outcome</p>
              <dl className="mt-1 space-y-1 text-sm">
                {ROUTING_OUTCOMES.map((o) => (
                  <div key={o.outcome}>
                    <dt className="inline font-medium text-foreground">{o.outcome}: </dt>
                    <dd className="inline text-muted-foreground">{o.text}</dd>
                  </div>
                ))}
              </dl>
            </li>
          </ol>
          <p className="mt-3 text-center text-sm">
            <Link to="/markets/" className="text-primary hover:underline">Each step in full, with laws and rules per market</Link>
          </p>
        </figure>

        <h3 className="text-2xl font-bold text-center mb-2">Markets the engine knows</h3>
        <p className="mx-auto mb-6 max-w-3xl text-center text-muted-foreground">{ROUTING_LOGGED_LINE}</p>
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <MarketMapThumbnail />
          <MarketGrid />
        </div>

        <h3 className="text-2xl font-bold text-center mt-16 mb-6">What works in every market today</h3>
        <WorksToday />
      </div>
    </section>
  );
}
