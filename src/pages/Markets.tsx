import PublicLayout from "@/components/PublicLayout";
import { MarketMap } from "@/components/home/MarketMap";
import { BannerLanguageMap } from "@/components/home/BannerLanguageMap";
import { MarketTable, WorksToday } from "@/components/home/MarketTable";
import { ROUTING_TODAY_LINE } from "@/components/home/copy";
import { DISCLAIMER, PACK_VERSION } from "@/lib/jurisdiction";
import { useSEO } from "@/hooks/useSEO";
import { seoFor } from "@/marketing-routes";

// Rule status per market on a world map. Every status, category and row comes from the rule engine
// (src/lib/marketStatus.ts, src/lib/marketMap.ts); the shapes from scripts/build-market-map.mjs.
export default function Markets() {
  useSEO(seoFor("/markets/"));
  return (
    <PublicLayout>
      <section className="container mx-auto max-w-6xl px-4 py-12 sm:py-16">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Markets the engine knows</h1>
        <p className="mt-3 max-w-3xl text-lg text-muted-foreground">
          CortIQ's rule engine matches each request to one of these markets, from the signed edge location when there is one, and checks
          the rule for its purpose. This page shows the rule status per market, computed from rule pack {PACK_VERSION}.
          Market rules are logged against real traffic, not applied.
        </p>
        <p className="mt-3 max-w-3xl text-muted-foreground">{ROUTING_TODAY_LINE}</p>
        <div className="mt-8">
          <MarketMap idPrefix="markets-page" />
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Shapes are simplified from Natural Earth (public domain) and, for US states, US Census Bureau cartographic
          boundary files. The map shows markets, not countries, and is not a statement on any border or territory. Very
          small states are drawn as dots; the list above and the table below include every market.
        </p>
      </section>

      <section className="container mx-auto max-w-6xl px-4 pb-12">
        <h2 className="mb-6 text-2xl font-bold">Rule status per market</h2>
        <MarketTable />
      </section>

      <section className="container mx-auto max-w-6xl px-4 pb-12">
        <h2 className="mb-2 text-2xl font-bold">Banner languages</h2>
        <p className="mb-6 max-w-3xl text-muted-foreground">
          The consent banner comes in 13 languages. This map shows where each one is an official language. It is a
          separate layer from the markets: a language does not change which rules apply.
        </p>
        <BannerLanguageMap idPrefix="markets-page-langs" />
      </section>

      <section className="container mx-auto max-w-6xl px-4 pb-16">
        <h2 className="mb-6 text-2xl font-bold">What works in every market today</h2>
        <WorksToday />
        <p className="mt-6 text-sm text-muted-foreground">{DISCLAIMER}</p>
      </section>
    </PublicLayout>
  );
}
