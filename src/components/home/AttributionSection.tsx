import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowDown, ArrowRight } from "lucide-react";
import { SectionHeader } from "./SectionHeader";
import { BrowserFrame } from "./BrowserFrame";
import { ATTRIBUTION, CONVERSIONS_ID } from "./copy";
import { ATTRIBUTION_FLOW, CONVERSION_BARS } from "@/data/homeSample";

export function AttributionSection() {
  return (
    <section id={CONVERSIONS_ID} className="py-20 px-4 bg-muted/30 scroll-mt-16">
      <div className="container mx-auto max-w-6xl">
        <SectionHeader
          eyebrow="Ads and attribution"
          title="Conversions you can trust, from consented visits"
          intro="Paid traffic is measured with the same consent rules as everything else, and the data that goes back to Google Ads is the data your CRM qualified."
        />
        <BrowserFrame title="Lead quality pipeline" className="mb-2">
          <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-center">
            <ol className="flex flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              {ATTRIBUTION_FLOW.map((step, i) => (
                <li key={step} className="flex flex-col items-center gap-2 sm:flex-row">
                  <span className="rounded-lg border bg-muted/30 px-3 py-2 text-center text-sm font-medium">{step}</span>
                  {i < ATTRIBUTION_FLOW.length - 1 && (
                    <>
                      <ArrowRight className="hidden h-4 w-4 text-muted-foreground sm:block" aria-hidden="true" />
                      <ArrowDown className="h-4 w-4 text-muted-foreground sm:hidden" aria-hidden="true" />
                    </>
                  )}
                </li>
              ))}
            </ol>
            <dl className="space-y-2">
              {CONVERSION_BARS.map((b) => (
                <div key={b.label} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 text-xs text-muted-foreground">
                  <dt>{b.label}</dt>
                  <dd className="tabular-nums">{b.value.toLocaleString("en-US")}</dd>
                  <dd className="col-span-2 mt-1 h-2 rounded bg-muted" aria-hidden="true">
                    <div className="h-2 rounded bg-primary" style={{ width: `${(b.value / CONVERSION_BARS[0].value) * 100}%` }} />
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </BrowserFrame>
        <p className="mb-8 text-center text-xs text-muted-foreground">Only visits with marketing consent are uploaded.</p>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {ATTRIBUTION.map((a) => (
            <Card key={a.title}>
              <CardHeader>
                <CardTitle className="text-base">{a.title}</CardTitle>
                <CardDescription className="text-sm">{a.text}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Also works next to GA4: keep it behind the same banner, with Consent Mode v2 if you want it.
        </p>
      </div>
    </section>
  );
}
