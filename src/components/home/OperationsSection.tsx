import { Link } from "react-router-dom";
import { ArrowRight, Activity, Lock, Server, Code, type LucideIcon } from "lucide-react";
import { SectionHeader } from "./SectionHeader";
import { OPERATIONS } from "./copy";

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
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {OPERATIONS.map((o) => {
            const Icon = OPERATION_ICONS[o.id];
            return (
              <div key={o.title} className="rounded-lg border p-5">
                <Icon className="h-6 w-6 text-primary mb-3" aria-hidden="true" />
                <h3 className="font-semibold mb-2">{o.title}</h3>
                <p className="text-sm text-muted-foreground">{o.text}</p>
              </div>
            );
          })}
        </div>
        <div className="mt-8 text-center">
          <Link to="/integrations/" className="inline-flex items-center text-primary font-medium hover:underline">
            See all integrations <ArrowRight className="ml-1 h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
