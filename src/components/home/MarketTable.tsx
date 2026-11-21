import { Check } from "lucide-react";
import { DISCLAIMER, PACK_VERSION } from "@/lib/jurisdiction";
import { MARKET_LABEL, marketStatuses, type MarketStatus } from "@/lib/marketStatus";
import { ROUTING_LAW_SHORT, ROUTING_LAWS, ROUTING_RULES_NOTE, ROUTING_WORKS_TODAY } from "./copy";

// Status per market is computed from the rule engine at build time; nothing here is hand-written.
// The homepage shows MarketGrid (short law name, short status); /markets/ shows MarketTable with the full
// citation and the rules on file folded away, so every row starts at the same height.
const STATUSES = marketStatuses();

const rulesSummary = (s: MarketStatus) =>
  s.rulesOnFile.length ? `${s.rulesOnFile.length} ${s.rulesOnFile.length === 1 ? "rule" : "rules"} on file` : "No rules on file";

/** Short law name with the full citation folded under it. */
function LawCell({ s }: { s: MarketStatus }) {
  return (
    <details className="group">
      <summary className="cursor-pointer list-none text-foreground marker:hidden [&::-webkit-details-marker]:hidden">
        {ROUTING_LAW_SHORT[s.market]} <span className="text-xs text-primary group-open:hidden">Full citation</span>
      </summary>
      <p className="mt-1 text-muted-foreground">{ROUTING_LAWS[s.market]}</p>
    </details>
  );
}

function RulesCell({ s }: { s: MarketStatus }) {
  if (!s.rulesOnFile.length) return <span className="text-muted-foreground">{rulesSummary(s)}</span>;
  return (
    <details>
      <summary className="cursor-pointer text-muted-foreground">{rulesSummary(s)}</summary>
      <ul className="mt-1 space-y-1 text-muted-foreground">{s.rulesOnFile.map((r) => <li key={r.id}>{r.text}</li>)}</ul>
    </details>
  );
}

/** One market's row as a definition list: the phone cards and the map's detail panel. */
export function MarketFields({ s }: { s: MarketStatus }) {
  return (
    <dl className="mt-2 space-y-2">
      <div><dt className="text-xs text-muted-foreground">Engine status</dt><dd className="text-foreground">{s.status}</dd></div>
      <div><dt className="text-xs text-muted-foreground">Main laws the rules refer to</dt><dd><LawCell s={s} /></dd></div>
      <div><dt className="text-xs text-muted-foreground">Rules</dt><dd><RulesCell s={s} /></dd></div>
    </dl>
  );
}

function StatusNote() {
  return (
    <p className="mt-3 text-center text-xs text-muted-foreground">
      {ROUTING_RULES_NOTE} Status shows what the engine logs, computed from rule pack {PACK_VERSION}. It does not change what is collected today. {DISCLAIMER}
    </p>
  );
}

/** Homepage: every market as a small card, same height, full status on hover and for screen readers. */
export function MarketGrid() {
  return (
    <>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label={`Markets and engine status, rule pack ${PACK_VERSION}`}>
        {STATUSES.map((s) => (
          <li key={s.market} data-market={s.market} title={s.status} className="rounded-md border bg-background px-3 py-2">
            <p className="text-sm font-medium leading-snug text-foreground">{MARKET_LABEL[s.market]}</p>
            <p className="truncate text-xs text-muted-foreground">{ROUTING_LAW_SHORT[s.market]}</p>
            <p className="mt-1 truncate text-xs text-primary">
              <span aria-hidden="true">{s.statusShort}</span>
              <span className="sr-only">{s.status}</span>
            </p>
          </li>
        ))}
      </ul>
      <StatusNote />
    </>
  );
}

/** /markets/: the full table; phones get one card per market. */
export function MarketTable() {
  return (
    <>
      <ul className="space-y-3 sm:hidden">
        {STATUSES.map((s) => (
          <li key={s.market} className="rounded-lg border bg-background p-4 text-sm">
            <p className="font-medium text-foreground">{MARKET_LABEL[s.market]}</p>
            <MarketFields s={s} />
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto rounded-lg border bg-background sm:block">
        <table className="w-full min-w-[40rem] table-fixed text-sm">
          <caption className="sr-only">Markets, main laws, rules on file and status, from rule pack {PACK_VERSION}</caption>
          <colgroup>
            <col className="w-[22%]" /><col className="w-[30%]" /><col className="w-[18%]" /><col className="w-[30%]" />
          </colgroup>
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th scope="col" className="p-3 font-medium">Market</th>
              <th scope="col" className="p-3 font-medium">Main laws the rules refer to</th>
              <th scope="col" className="p-3 font-medium">Rules</th>
              <th scope="col" className="p-3 font-medium">Engine status</th>
            </tr>
          </thead>
          <tbody>
            {STATUSES.map((s) => (
              <tr key={s.market} data-market={s.market} className="border-b last:border-0 align-top">
                <th scope="row" className="p-3 text-left font-medium text-foreground">{MARKET_LABEL[s.market]}</th>
                <td className="p-3"><LawCell s={s} /></td>
                <td className="p-3"><RulesCell s={s} /></td>
                <td className="p-3 text-foreground">{s.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <StatusNote />
    </>
  );
}

/** "What works in every market today": the same list on the homepage and on /markets/. */
export function WorksToday() {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {ROUTING_WORKS_TODAY.map((w) => (
        <li key={w.title} className="flex gap-3 rounded-lg border bg-background p-4">
          <Check className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <div>
            <p className="font-medium text-foreground">{w.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{w.text}</p>
            {"more" in w && w.more && (
              <details className="mt-1 text-sm">
                <summary className="cursor-pointer text-primary">More</summary>
                <p className="mt-1 text-muted-foreground">{w.more}</p>
              </details>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
