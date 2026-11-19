import { BarChart3, Shield, Users, type LucideIcon } from "lucide-react";
import { MODES } from "./copy";

const MODE_ICONS: LucideIcon[] = [Shield, Users, BarChart3];

export function ModesSection() {
  return (
    <section className="pb-20 px-4">
      <div className="container mx-auto max-w-6xl">
        <h3 className="mb-6 text-center text-xl font-bold">Three ways to measure visitors</h3>
        <div className="grid gap-6 md:grid-cols-3">
          {MODES.map((m, i) => {
            const Icon = MODE_ICONS[i] ?? Shield;
            return (
              <div key={m.title} className="rounded-xl border p-5">
                <Icon className="mb-3 h-6 w-6 text-primary" aria-hidden="true" />
                <h4 className="mb-1 font-semibold">{m.title}</h4>
                <p className="text-sm text-muted-foreground">{m.short}</p>
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer font-medium text-primary">Details<span className="sr-only">: {m.title}</span></summary>
                  <p className="mt-2 text-muted-foreground">{m.text}</p>
                </details>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
