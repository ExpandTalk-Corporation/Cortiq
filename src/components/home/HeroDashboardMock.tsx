import { BOT_CATEGORIES, BOT_CATEGORY_META, type BotCategory } from "@/lib/aiBotRegistry";
import { HERO_DAYS, HERO_HUMAN_VISITS, HERO_TOP_BOTS } from "@/data/homeSample";
import { BrowserFrame } from "./BrowserFrame";
import { CATEGORY_COLORS } from "./categoryColors";
import { botNames } from "./botNames";

const fmt = (n: number) => n.toLocaleString("en-US");
const dayTotal = (d: Record<BotCategory, number>) => BOT_CATEGORIES.reduce((sum, c) => sum + d[c], 0);

const BAR = 14;
const GAP = 6;
const H = 100;

/** Product-style dashboard with illustrative numbers. Static SVG, so it prerenders. */
export function HeroDashboardMock() {
  const aiVisits = HERO_DAYS.reduce((sum, d) => sum + dayTotal(d), 0);
  const share = ((aiVisits / (aiVisits + HERO_HUMAN_VISITS)) * 100).toFixed(1);
  const max = Math.max(...HERO_DAYS.map(dayTotal));
  const width = HERO_DAYS.length * (BAR + GAP) - GAP;
  const topBots = HERO_TOP_BOTS
    .map((b) => ({ ...b, name: botNames(b.category)[b.index] }))
    .filter((b): b is typeof b & { name: string } => Boolean(b.name));
  const kpis: [string, string][] = [
    ["AI visits", fmt(aiVisits)],
    ["Human visits", fmt(HERO_HUMAN_VISITS)],
    ["AI share", `${share}%`],
  ];

  return (
    <BrowserFrame title="CortIQ · AI traffic · last 14 days">
      <div className="space-y-4 p-4 sm:p-5">
        <dl className="grid grid-cols-3 gap-3">
          {kpis.map(([label, value]) => (
            <div key={label} className="rounded-lg border p-3">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="text-lg font-bold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        <svg viewBox={`0 0 ${width} ${H}`} className="h-28 w-full" preserveAspectRatio="none" role="img" aria-label="Example chart: AI visits per day, stacked by category">
          {HERO_DAYS.map((d, i) => {
            let y = H;
            return BOT_CATEGORIES.map((c) => {
              const h = (d[c] / max) * H;
              y -= h;
              return <rect key={`${i}-${c}`} x={i * (BAR + GAP)} y={y} width={BAR} height={h} fill={CATEGORY_COLORS[c].hex} />;
            });
          })}
        </svg>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {BOT_CATEGORIES.map((c) => (
            <li key={c} className="flex items-center gap-1.5">
              <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-sm ${CATEGORY_COLORS[c].bg}`} />
              {BOT_CATEGORY_META[c].label}
            </li>
          ))}
        </ul>
        <ol className="divide-y rounded-lg border text-sm">
          {topBots.map((b) => (
            <li key={`${b.category}-${b.index}`} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="flex items-center gap-2 truncate">
                <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${CATEGORY_COLORS[b.category].bg}`} />
                {b.name}
              </span>
              <span className="tabular-nums text-muted-foreground">{fmt(b.visits)}</span>
            </li>
          ))}
        </ol>
      </div>
    </BrowserFrame>
  );
}
