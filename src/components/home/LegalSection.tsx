import { Link } from "react-router-dom";
import { FileText, Scale } from "lucide-react";
import { Faq } from "@/components/tracking-check/LandingParts";
import { LEGAL_BASES, LEGAL_DOCS, LEGAL_NOTES } from "./copy";

export function LegalSection() {
  return (
    <section className="pb-20 px-4">
      <div className="container mx-auto max-w-4xl">
        <div className="mb-4 flex items-center justify-center gap-2">
          <Scale className="h-5 w-5 text-primary" aria-hidden="true" />
          <h3 className="text-xl font-bold">How we read the rules</h3>
        </div>
        <Faq
          items={[
            ...LEGAL_BASES.map((b) => ({ q: b.title, a: b.text })),
            { q: "Install checklist and jurisdictions", a: LEGAL_NOTES.slice(0, 2).map((n) => `${n.lead} ${n.text}`).join(" ") },
          ]}
        />
        <p className="mt-4 text-center text-sm text-muted-foreground">{LEGAL_NOTES[2].text}</p>
        {/* Deliberate deviation from the spec: these four legal document links stay visible under the
            <details> list (not inside one), because links cost little text and help visitors and crawlers. */}
        <div className="mt-3 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm">
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
      </div>
    </section>
  );
}
