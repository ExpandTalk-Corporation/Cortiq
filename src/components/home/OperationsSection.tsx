import { Link } from "react-router-dom";
import { ArrowRight, Activity, CheckCircle2, Lock, Server, Code, type LucideIcon } from "lucide-react";
import { SectionHeader } from "./SectionHeader";
import { BrowserFrame } from "./BrowserFrame";
import { OPERATIONS } from "./copy";
import { STATUS_ROWS, PLATFORMS } from "@/data/homeSample";

const OPERATION_ICONS: Record<string, LucideIcon> = { server: Server, uptime: Activity, sri: Lock, api: Code };

export function OperationsSection() {
  return (
    <section className="py-20 px-4">
      <div className="container mx-auto max-w-6xl">
        <SectionHeader
          eyebrow="Built to run"
          title="Measurement that tells you when it breaks"
          intro="Installed once, then watched: CortIQ checks the site and its own snippet, and the scripts can be pinned so they never change under you."
        />
        <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
          <BrowserFrame title="Site health">
            <ul className="divide-y">
              {STATUS_ROWS.map((r) => (
                <li key={r.label} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                  <span className="flex items-center gap-2 font-medium">
                    <CheckCircle2 className="h-4 w-4 text-green-700" aria-hidden="true" />
                    {r.label}
                  </span>
                  <span className="text-muted-foreground">{r.value}</span>
                </li>
              ))}
            </ul>
          </BrowserFrame>
          <div className="grid gap-4 sm:grid-cols-2">
            {OPERATIONS.map((o) => {
              const Icon = OPERATION_ICONS[o.id];
              return (
                <div key={o.id} className="rounded-lg border p-4">
                  <Icon className="mb-2 h-5 w-5 text-primary" aria-hidden="true" />
                  <h3 className="mb-1 font-semibold">{o.title}</h3>
                  <p className="text-sm text-muted-foreground">{o.text}</p>
                </div>
              );
            })}
          </div>
        </div>
        <div className="mt-8 text-center">
          <p className="mb-3 text-sm font-medium text-muted-foreground">Works with</p>
          <ul className="flex flex-wrap justify-center gap-2">
            {PLATFORMS.map((p) => (
              <li key={p} className="rounded-full border px-3 py-1 text-sm">{p}</li>
            ))}
          </ul>
          <Link to="/integrations/" className="mt-6 inline-flex items-center text-primary font-medium hover:underline">
            See all integrations <ArrowRight className="ml-1 h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
