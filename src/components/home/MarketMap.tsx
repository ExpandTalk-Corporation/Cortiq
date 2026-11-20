import { useState, type KeyboardEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { MARKETS, type Market } from "@/lib/jurisdiction";
import { MARKET_LABEL } from "@/lib/marketStatus";
import { marketMapModel, type MapCategory, type MarketMapEntry } from "@/lib/marketMap";
import { MAP_SHAPES, MAP_THUMB, MAP_VIEWBOX } from "@/lib/marketMapPaths.generated";
import { MarketFields } from "./MarketTable";

// A static inline SVG: shapes are generated at dev time (scripts/build-market-map.mjs), the category per market comes
// from the rule engine (src/lib/marketMap.ts). No tiles, no fetch, no external URLs; it renders the same on the server
// and in the browser. Colours are theme tokens (src/index.css, .market-map); market rules are also hatched.
const MODEL = marketMapModel();
const ENTRY = Object.fromEntries(MODEL.entries.map((e) => [e.status.market, e])) as Record<Market, MarketMapEntry>;
const GROUPS = MARKETS.map((market) => ({ market, shapes: MAP_SHAPES.filter((s) => s.market === market) }));

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
        ? { role: "group", "aria-label": "World map of the markets the engine knows. Select a market for its rule status." }
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
          className={`mm-${ENTRY[market].category}`}
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

function Legend({ idPrefix }: { idPrefix: string }) {
  return (
    <ul className="flex flex-col gap-2 text-sm sm:flex-row sm:flex-wrap sm:gap-x-6">
      {MODEL.legend.map((l) => (
        <li key={l.category} data-category={l.category} className="flex items-center gap-2 text-muted-foreground">
          <Swatch category={l.category} idPrefix={idPrefix} />
          <span>
            <span className="text-foreground">{l.label}</span> ({l.markets.length} of {MARKETS.length} markets)
          </span>
        </li>
      ))}
    </ul>
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
        Rule status per market on a map <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
      </span>
    </Link>
  );
}
