import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Target } from "lucide-react";
import { SectionHeader } from "./SectionHeader";
import { ATTRIBUTION } from "./copy";

export function AttributionSection() {
  return (
    <section className="py-20 px-4 bg-muted/30">
      <div className="container mx-auto max-w-6xl">
        <SectionHeader
          eyebrow="Ads and attribution"
          title="Conversions you can trust, from consented visits"
          intro="Paid traffic is measured with the same consent rules as everything else, and the data that goes back to Google Ads is the data your CRM qualified."
        />
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {ATTRIBUTION.map((a) => (
            <Card key={a.title}>
              <CardHeader>
                <Target className="h-6 w-6 text-primary mb-2" aria-hidden="true" />
                <CardTitle className="text-lg">{a.title}</CardTitle>
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
