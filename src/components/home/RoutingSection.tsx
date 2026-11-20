import { ArrowDown, ArrowRight, Check } from "lucide-react";
import { DISCLAIMER, PACK_VERSION } from "@/lib/jurisdiction";
import { MARKET_LABEL, marketStatuses } from "@/lib/marketStatus";
import { SectionHeader } from "./SectionHeader";
import {
  ROUTING_FLOW, ROUTING_ID, ROUTING_LAWS, ROUTING_OUTCOMES, ROUTING_RULES_NOTE, ROUTING_TODAY_LINE, ROUTING_WORKS_TODAY,
} from "./copy";

// Status per market is computed from the rule engine at build time; nothing here is hand-written.
const STATUSES = marketStatuses();

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
        {/* Phones: one card per market, so the status is never scrolled out of view. */}
        <ul className="space-y-3 sm:hidden">
          {STATUSES.map((s) => (
            <li key={s.market} className="rounded-lg border bg-background p-4 text-sm">
              <p className="font-medium text-foreground">{MARKET_LABEL[s.market]}</p>
              <dl className="mt-2 space-y-2">
                <div><dt className="text-xs text-muted-foreground">Engine status (logged, not applied)</dt><dd className="text-foreground">{s.status}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Main laws</dt><dd className="text-muted-foreground">{ROUTING_LAWS[s.market]}</dd></div>
                <div>
                  <dt className="text-xs text-muted-foreground">Rules on file</dt>
                  <dd className="text-muted-foreground">{s.rulesOnFile.length ? s.rulesOnFile.map((r) => r.text).join("; ") : "None"}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
        <div className="hidden overflow-x-auto rounded-lg border bg-background sm:block">
          <table className="w-full min-w-[40rem] text-sm">
            <caption className="sr-only">Markets, main laws, rules on file and status, from rule pack {PACK_VERSION}</caption>
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th scope="col" className="p-3 font-medium">Market</th>
                <th scope="col" className="p-3 font-medium">Main laws</th>
                <th scope="col" className="p-3 font-medium">Rules on file</th>
                <th scope="col" className="p-3 font-medium">Engine status (logged, not applied)</th>
              </tr>
            </thead>
            <tbody>
              {STATUSES.map((s) => (
                <tr key={s.market} data-market={s.market} className="border-b last:border-0 align-top">
                  <th scope="row" className="p-3 text-left font-medium text-foreground">{MARKET_LABEL[s.market]}</th>
                  <td className="p-3 text-muted-foreground">{ROUTING_LAWS[s.market]}</td>
                  <td className="p-3 text-muted-foreground">
                    {s.rulesOnFile.length ? (
                      <ul className="space-y-1">{s.rulesOnFile.map((r) => <li key={r.id}>{r.text}</li>)}</ul>
                    ) : "None"}
                  </td>
                  <td className="p-3 text-foreground">{s.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-center text-xs text-muted-foreground">
          {ROUTING_RULES_NOTE} Status shows what the engine logs, computed from rule pack {PACK_VERSION}. It does not change what is collected today. {DISCLAIMER}
        </p>

        <h3 className="text-2xl font-bold text-center mt-16 mb-6">What works in every market today</h3>
        <ul className="grid gap-4 md:grid-cols-2">
          {ROUTING_WORKS_TODAY.map((w) => (
            <li key={w.title} className="flex gap-3 rounded-lg border bg-background p-4">
              <Check className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <p className="font-medium text-foreground">{w.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{w.text}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-center text-sm text-muted-foreground">{DISCLAIMER}</p>
      </div>
    </section>
  );
}
