import { useState, type KeyboardEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { MARKETS, type Market } from "@/lib/jurisdiction";
import { MARKET_LABEL } from "@/lib/marketStatus";
import { marketMapModel, type MapCategory, type MarketMapEntry } from "@/lib/marketMap";
import { MAP_FALLBACK, MAP_OUTLINE, MAP_SHAPES, MAP_THUMB, MAP_VIEWBOX } from "@/lib/marketMapPaths.generated";
import { MarketFields } from "./MarketTable";

// A static inline SVG: shapes are generated at dev time (scripts/build-market-map.mjs), the category per market comes
// from the rule engine (src/lib/marketMap.ts). No tiles, no fetch, no external URLs; it renders the same on the server
// and in the browser. Colours are theme tokens (src/index.css, .market-map); market rules are also hatched.
// Market layer on top: every named market has a dark border; the engine's fallback market has none and a lighter fill.
const MODEL = marketMapModel();
const ENTRY = Object.fromEntries(MODEL.entries.map((e) => [e.status.market, e])) as Record<Market, MarketMapEntry>;
const GROUPS = MARKETS.map((market) => ({ market, shapes: MAP_SHAPES.filter((s) => s.market === market) }));
const NAMED = MARKETS.filter((m) => m !== MAP_FALLBACK);
const borderOf = (m: Market) => MAP_OUTLINE[m] ?? GROUPS.find((g) => g.market === m)!.shapes.map((s) => s.d).join("");
const groupClass = (m: Market) =>
  `mm-${ENTRY[m].category}${m === MAP_FALLBACK && ENTRY[m].category === "global_only" ? " mm-fallback" : ""}`;

const hatchId = (idPrefix: string) => `${idPrefix}-hatch`;
const fillFor = (category: MapCategory, idPrefix: string) => (category === "market_rules" ? `url(#${hatchId(idPrefix)})` : undefined);
const marketName = (m: Market) => `${MARKET_LABEL[m]}: ${ENTRY[m].categoryLabel}`;

// With onSelect: the full shapes, each market focusable. Without: the coarser thumbnail outline, decorative.
interface SvgProps { idPrefix: string; selected?: Market; onSelect?: (m: Market) => void }

function MapSvg({ idPrefix, selected, onSelect }: SvgProps) {
  const interactive = Boolean(onSelect);
  const key = (m: Market) => (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect?.(m); }
  };
  return (
    <svg
      viewBox={MAP_VIEWBOX}
      className="block h-auto w-full"
      {...(interactive
        ? { role: "group", "aria-label": "World map of the markets CortIQ's rule engine knows. Select a market for the status of CortIQ's rules there. Not a statement on any border." }
        : { "aria-hidden": true, focusable: "false" })}
    >
      <defs>
        <pattern id={hatchId(idPrefix)} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect className="mm-hatch-bg" width="6" height="6" />
          <path className="mm-hatch-line" d="M0 0V6" />
        </pattern>
      </defs>
      {GROUPS.map(({ market, shapes }) => (
        <g
          key={market}
          data-market={market}
          data-named={market !== MAP_FALLBACK}
          className={groupClass(market)}
          fill={fillFor(ENTRY[market].category, idPrefix)}
          {...(interactive
            ? { tabIndex: 0, role: "button", "aria-label": marketName(market), "aria-pressed": selected === market,
                onClick: () => onSelect?.(market), onKeyDown: key(market) }
            : {})}
        >
          {interactive && <title>{marketName(market)}</title>}
          {interactive ? shapes.map((s) => <path key={s.codes[0]} d={s.d} />) : <path d={MAP_THUMB[market]} />}
        </g>
      ))}
      <g className="mm-borders" aria-hidden="true">
        {NAMED.map((m) => <path key={m} data-border={m} d={interactive ? borderOf(m) : MAP_THUMB[m]} />)}
      </g>
    </svg>
  );
}

function Swatch({ category, idPrefix }: { category: MapCategory; idPrefix: string }) {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 rounded-sm" aria-hidden="true" focusable="false">
      <rect width="16" height="16" className={`mm-${category}`} fill={fillFor(category, idPrefix)} />
    </svg>
  );
}

// The market layer, explained by shape as well as colour: a thick outline = a named market, a light fill without
// outline = the engine's fallback for every country no market names.
function LayerSwatch({ kind }: { kind: "border" | "fallback" }) {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0" aria-hidden="true" focusable="false">
      <rect x="1" y="1" width="14" height="14" rx="1" className={`mm-swatch-${kind}`} />
    </svg>
  );
}

function Legend({ idPrefix }: { idPrefix: string }) {
  return (
    <div className="space-y-2 text-sm">
      <ul className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-x-6">
        {MODEL.legend.map((l) => (
          <li key={l.category} data-category={l.category} className="flex items-center gap-2 text-muted-foreground">
            <Swatch category={l.category} idPrefix={idPrefix} />
            <span>
              <span className="text-foreground">{l.label}</span> ({l.markets.length} of {MARKETS.length} markets)
            </span>
          </li>
        ))}
      </ul>
      <ul className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-x-6" data-layer="markets">
        <li className="flex items-center gap-2 text-muted-foreground">
          <LayerSwatch kind="border" />
          <span><span className="text-foreground">Thick outline</span>: one of the {NAMED.length} named markets</span>
        </li>
        <li className="flex items-center gap-2 text-muted-foreground">
          <LayerSwatch kind="fallback" />
          <span>
            <span className="text-foreground">Lighter, no outline</span>: {MARKET_LABEL[MAP_FALLBACK]}, the engine's fallback for countries no market names
          </span>
        </li>
      </ul>
      <p className="text-xs text-muted-foreground">
        Colours show the status of CortIQ's own rules for each market, not whether a site meets local law.
      </p>
    </div>
  );
}

/** Full map with legend, a market picker and the selected market's row (on /markets/). */
export function MarketMap({ idPrefix = "market-map" }: { idPrefix?: string }) {
  const [selected, setSelected] = useState<Market>(MARKETS[0]);
  const entry = ENTRY[selected];
  return (
    <div className="market-map space-y-6">
      <div className="rounded-lg border bg-background p-2 sm:p-4">
        <MapSvg idPrefix={idPrefix} selected={selected} onSelect={setSelected} />
      </div>
      <Legend idPrefix={idPrefix} />
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div>
          <p className="mb-2 text-sm font-medium text-foreground" id={`${idPrefix}-pick`}>Choose a market</p>
          <ul className="flex flex-wrap gap-2" aria-labelledby={`${idPrefix}-pick`}>
            {MARKETS.map((m) => (
              <li key={m}>
                <button
                  type="button"
                  aria-pressed={selected === m}
                  onClick={() => setSelected(m)}
                  className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-left text-sm hover:bg-muted aria-pressed:border-primary aria-pressed:bg-muted"
                >
                  <Swatch category={ENTRY[m].category} idPrefix={idPrefix} />
                  {MARKET_LABEL[m]}
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border bg-background p-4 text-sm" aria-live="polite" data-selected={selected}>
          <p className="font-medium text-foreground">{MARKET_LABEL[selected]}</p>
          <p className="mt-1 flex items-center gap-2 text-muted-foreground">
            <Swatch category={entry.category} idPrefix={idPrefix} />
            {entry.categoryLabel}
          </p>
          <MarketFields s={entry.status} />
        </div>
      </div>
    </div>
  );
}

/** Small map for the homepage: one link to /markets/, no interaction of its own. */
export function MarketMapThumbnail({ idPrefix = "market-map-thumb" }: { idPrefix?: string }) {
  return (
    <Link to="/markets/" className="market-map group block rounded-lg border bg-background p-3 transition-colors hover:border-primary sm:p-4">
      <MapSvg idPrefix={idPrefix} />
      <div className="mt-3">
        <Legend idPrefix={idPrefix} />
      </div>
      <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary">
        Rule status per market on a map (logged, not applied) <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
      </span>
    </Link>
  );
}
