import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "react-router-dom";
import { Languages, ShieldCheck, Scale, FileText } from "lucide-react";
import { SectionHeader } from "./SectionHeader";
import { BANNER_POINTS, MODES, LEGAL_BASES, LEGAL_DOCS, LEGAL_NOTES } from "./copy";

export function ConsentSection() {
  return (
    <section className="py-20 px-4">
      <div className="container mx-auto max-w-6xl">
        <SectionHeader
          eyebrow="Consent and the law"
          title="Consent built in, in five languages"
          intro="Browser analytics waits for consent, unless you switch on aggregate mode. The banner, the consent log and the policy texts are part of the product, so the measurement and the legal side are set up together."
        />

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          {BANNER_POINTS.map((p, i) => (
            <div key={p.title} className="rounded-lg border p-5">
              <div className="flex items-center gap-2 mb-2">
                {i === 0 ? <Languages className="h-5 w-5 text-primary" aria-hidden="true" /> : <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />}
                <h3 className="font-semibold">{p.title}</h3>
              </div>
              <p className="text-sm text-muted-foreground">{p.text}</p>
            </div>
          ))}
        </div>

        <h3 className="text-xl font-bold mb-4 text-center">Three ways to measure visitors</h3>
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          {MODES.map((m) => (
            <Card key={m.title}>
              <CardHeader>
                <CardTitle className="text-lg">{m.title}</CardTitle>
                <CardDescription className="text-sm">{m.text}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>

        <Card className="border-primary/20">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Scale className="h-5 w-5 text-primary" aria-hidden="true" />
              <CardTitle className="text-xl">How we read the rules</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid md:grid-cols-3 gap-6">
              {LEGAL_BASES.map((b) => (
                <div key={b.title}>
                  <h4 className="font-semibold mb-2">{b.title}</h4>
                  <p className="text-sm text-muted-foreground">{b.text}</p>
                </div>
              ))}
            </div>
            <div className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground space-y-2">
              {LEGAL_NOTES.map((n) => (
                <p key={n.text}>{n.lead && <strong className="text-foreground">{n.lead}</strong>} {n.text}</p>
              ))}
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              {LEGAL_DOCS.map((d) =>
                d.to ? (
                  <Link key={d.label} to={d.to} className="inline-flex items-center text-primary hover:underline">
                    <FileText className="mr-1.5 h-4 w-4" aria-hidden="true" />{d.label}
                  </Link>
                ) : (
                  <a key={d.label} href={d.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-primary hover:underline">
                    <FileText className="mr-1.5 h-4 w-4" aria-hidden="true" />{d.label}
                  </a>
                ),
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
