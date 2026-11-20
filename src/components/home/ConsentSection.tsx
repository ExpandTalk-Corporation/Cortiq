import { useState } from "react";
import { EyeOff, Languages, Puzzle, RotateCcw, Scale, ScrollText, Settings2, type LucideIcon } from "lucide-react";
import { BANNER_POINTS } from "./copy";
import { SectionHeader } from "./SectionHeader";

const DEMO_LANGS = [
  { code: "en", label: "English" },
  { code: "sv", label: "Svenska" },
  { code: "de", label: "Deutsch" },
  { code: "fr", label: "Français" },
  { code: "pt", label: "Português" },
  { code: "nl", label: "Nederlands" },
  { code: "nb", label: "Norsk" },
  { code: "da", label: "Dansk" },
  { code: "fi", label: "Suomi" },
  { code: "pl", label: "Polski" },
  { code: "it", label: "Italiano" },
  { code: "es", label: "Español" },
  { code: "is", label: "Íslenska" },
] as const;
type DemoLang = (typeof DEMO_LANGS)[number]["code"];

// Icon per BANNER_POINTS title (not by position — titles in copy.ts can be reordered safely).
// "Reject is as easy as accept" has no dedicated icon in the set below, so it falls back to Scale.
const POINT_ICONS: Record<string, LucideIcon> = {
  "13 languages": Languages, // languages
  "Consent log": ScrollText, // consent log (also covers the 12/6 month re-ask mentioned in its text)
  "Global Privacy Control": EyeOff, // GPC
  "Google Consent Mode v2": Settings2, // Consent Mode v2
  "Your own CMP works too": Puzzle, // Cookiebot / CMP
};

export function ConsentSection() {
  const [lang, setLang] = useState<DemoLang>("en");
  const [run, setRun] = useState(0);

  return (
    <section className="py-20 px-4">
      <div className="container mx-auto max-w-6xl">
        <SectionHeader
          eyebrow="Consent and the law"
          title="Consent built in, in 13 languages"
          intro="Browser analytics waits for consent, unless you switch on aggregate mode. The banner, the consent log and the policy texts are part of the product, so the measurement and the legal side are set up together."
        />
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div>
            <div className="overflow-hidden rounded-xl border bg-background shadow-xl">
              <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-3 py-2">
                <div role="group" aria-label="Banner language" className="flex flex-wrap gap-1">
                  {DEMO_LANGS.map((l) => (
                    <button
                      key={l.code}
                      type="button"
                      lang={l.code}
                      aria-pressed={lang === l.code}
                      onClick={() => setLang(l.code)}
                      className={`rounded px-2 py-1.5 text-xs font-medium ${lang === l.code ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
                <button type="button" onClick={() => setRun((r) => r + 1)} className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  Show again
                </button>
              </div>
              <iframe
                key={`${lang}-${run}`}
                src={`/banner-demo/index.html?lang=${lang}`}
                title="Live example of the CortIQ consent banner"
                sandbox="allow-scripts"
                loading="lazy"
                className="block h-[520px] w-full sm:h-[460px]"
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">The real banner script. Choices made in this example are not saved or sent.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {BANNER_POINTS.map((p) => {
              const Icon = POINT_ICONS[p.title] ?? Scale;
              return (
                <div key={p.title} className="rounded-lg border p-4">
                  <div className="mb-1.5 flex items-center gap-2">
                    <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
                    <h3 className="font-semibold">{p.title}</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">{p.text}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
