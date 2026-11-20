import { Check } from "lucide-react";
import { DISCLAIMER, PACK_VERSION } from "@/lib/jurisdiction";
import { MARKET_LABEL, marketStatuses, type MarketStatus } from "@/lib/marketStatus";
import { ROUTING_LAWS, ROUTING_RULES_NOTE, ROUTING_WORKS_TODAY } from "./copy";

// Status per market is computed from the rule engine at build time; nothing here is hand-written.
// Used on the homepage (Routing per country) and on /markets/, so both always show the same rows.
const STATUSES = marketStatuses();

const rulesText = (s: MarketStatus) => (s.rulesOnFile.length ? s.rulesOnFile.map((r) => r.text).join("; ") : "None");

/** One market's row as a definition list: the phone cards and the map's detail panel. */
export function MarketFields({ s }: { s: MarketStatus }) {
  return (
    <dl className="mt-2 space-y-2">
      <div><dt className="text-xs text-muted-foreground">Engine status (logged, not applied)</dt><dd className="text-foreground">{s.status}</dd></div>
      <div><dt className="text-xs text-muted-foreground">Main laws</dt><dd className="text-muted-foreground">{ROUTING_LAWS[s.market]}</dd></div>
      <div><dt className="text-xs text-muted-foreground">Rules on file</dt><dd className="text-muted-foreground">{rulesText(s)}</dd></div>
    </dl>
  );
}

export function MarketTable() {
  return (
    <>
      {/* Phones: one card per market, so the status is never scrolled out of view. */}
      <ul className="space-y-3 sm:hidden">
        {STATUSES.map((s) => (
          <li key={s.market} className="rounded-lg border bg-background p-4 text-sm">
            <p className="font-medium text-foreground">{MARKET_LABEL[s.market]}</p>
            <MarketFields s={s} />
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
    </>
  );
}

/** "What works in every market today": the same list on the homepage and on /markets/. */
export function WorksToday() {
  return (
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
  );
}
