import { useState } from "react";
import { BANNER_LANGS } from "../../../supabase/functions/_shared/banner-langs";
import { MAP_SHAPES, MAP_VIEWBOX } from "@/lib/marketMapPaths.generated";
import { LANG_CLDR_VERSION, LANG_COUNTRIES, LANG_PATHS } from "@/lib/bannerLangMapPaths.generated";

// Where the banner's languages are official, per Unicode CLDR (scripts/build-market-map.mjs). A separate layer from
// the markets above: the banner picks its language from the page and the browser, never from the visitor's country,
// and a language says nothing about which rules apply. Same frame and land shapes as the market map; static, no fetch.
const LANG_LABEL: Record<string, string> = {
  sv: "Swedish", en: "English", de: "German", fr: "French", pt: "Portuguese", nl: "Dutch", nb: "Norwegian",
  da: "Danish", fi: "Finnish", pl: "Polish", it: "Italian", es: "Spanish", is: "Icelandic",
};
const LANGS = [...BANNER_LANGS];
const LAND = MAP_SHAPES.map((s) => s.d).join("");
const ALL_COUNTRIES = new Set(LANGS.flatMap((l) => LANG_COUNTRIES[l].map((c) => c.code)));

type Choice = "all" | string;

export function BannerLanguageMap({ idPrefix = "banner-langs" }: { idPrefix?: string }) {
  const [choice, setChoice] = useState<Choice>("all");
  const shown = choice === "all" ? LANGS : [choice];
  const countries = choice === "all" ? [] : LANG_COUNTRIES[choice];
  const label = choice === "all"
    ? `All ${LANGS.length} banner languages: official in ${ALL_COUNTRIES.size} countries and territories`
    : `${LANG_LABEL[choice]}: official in ${countries.length} ${countries.length === 1 ? "country" : "countries and territories"}`;
  return (
    <div className="market-map space-y-4">
      <ul className="flex flex-wrap gap-2" aria-label="Banner language">
        {(["all", ...LANGS] as Choice[]).map((l) => (
          <li key={l}>
            <button
              type="button"
              aria-pressed={choice === l}
              onClick={() => setChoice(l)}
              className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted aria-pressed:border-primary aria-pressed:bg-muted"
            >
              {l === "all" ? "All languages" : LANG_LABEL[l]}
            </button>
          </li>
        ))}
      </ul>
      <div className="rounded-lg border bg-background p-2 sm:p-4">
        <svg viewBox={MAP_VIEWBOX} className="block h-auto w-full" role="img" aria-labelledby={`${idPrefix}-label`}>
          <path className="ml-land" d={LAND} />
          {shown.map((l) => <path key={l} data-lang={l} className="ml-lang" d={LANG_PATHS[l]} />)}
        </svg>
      </div>
      <p id={`${idPrefix}-label`} className="text-sm font-medium text-foreground" aria-live="polite">{label}</p>
      {countries.length > 0 && (
        <p className="text-sm text-muted-foreground" data-countries={choice}>{countries.map((c) => c.name).join(", ")}</p>
      )}
      <p className="text-xs text-muted-foreground">
        Official and de facto official languages per Unicode CLDR {LANG_CLDR_VERSION}. The banner shows the language of the
        page (its lang attribute, or data-lang in the snippet) and otherwise the visitor's browser language; the country
        is never used. A country on this map gets the rules of its market above. Very small territories are listed but
        may be too small to draw.
      </p>
    </div>
  );
}
