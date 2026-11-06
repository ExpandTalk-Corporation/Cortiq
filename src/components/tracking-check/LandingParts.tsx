import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Check, ChevronDown, Globe, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TRACKING_CHECK_START as START } from "@/lib/trackingCheckUrl";

// Shared by the Tracking Check landing page and its SEO pages (cookie consent checker, migration check).

/** URL field that opens the start form prefilled; the migration pages pass mode="comparison". */
export function CheckForm({ id, size = "lg", mode, placeholder = "www.example.com" }: {
  id: string; size?: "lg" | "md"; mode?: "comparison"; placeholder?: string;
}) {
  const navigate = useNavigate();
  const [url, setUrl] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (url.trim()) params.set("url", url.trim());
    if (mode) params.set("mode", mode);
    const query = params.toString();
    navigate(query ? `${START}?${query}` : START);
  };
  const tall = size === "lg" ? "h-14 text-lg" : "h-12";
  return (
    <form onSubmit={submit} className="flex w-full flex-col gap-3 sm:flex-row">
      <label htmlFor={id} className="sr-only">{mode === "comparison" ? "New site address" : "Website address"}</label>
      <div className="relative flex-1">
        <Globe className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input id={id} type="text" inputMode="url" autoComplete="url" placeholder={placeholder} value={url}
          onChange={(e) => setUrl(e.target.value)} className={`${tall} bg-background pl-12 shadow-sm`} />
      </div>
      <Button type="submit" size="lg" className={`group ${tall} bg-gradient-primary px-7`}>
        {mode === "comparison" ? "Compare my sites" : "Check my website"}
        <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1 motion-reduce:transition-none" aria-hidden />
      </Button>
    </form>
  );
}

const MIGRATION_ROWS: { label: string; before: string; after: string; ok: boolean }[] = [
  { label: "/our-services", before: "200", after: "301 → /services", ok: true },
  { label: "gclid on /contact-us", before: "kept", after: "lost in redirect", ok: false },
  { label: "Google Analytics 4", before: "G-AB12CD", after: "G-AB12CD", ok: true },
  { label: "Meta Pixel", before: "loads", after: "missing", ok: false },
  { label: "HubSpot form", before: "on /contact-us", after: "on /contact", ok: true },
];

export function MigrationPreview() {
  return (
    <div className="overflow-hidden rounded-lg border text-sm">
      <div className="grid grid-cols-[1.2fr_1fr_1.2fr] gap-2 bg-muted/60 px-3 py-2 text-xs font-semibold text-muted-foreground">
        <span>Check</span><span>Current site</span><span>New site</span>
      </div>
      {MIGRATION_ROWS.map((r) => (
        <div key={r.label} className="grid grid-cols-[1.2fr_1fr_1.2fr] items-center gap-2 border-t px-3 py-2">
          <span className="truncate font-medium">{r.label}</span>
          <span className="truncate text-muted-foreground">{r.before}</span>
          <span className={`flex min-w-0 items-center gap-1.5 ${r.ok ? "" : "font-medium text-red-700 dark:text-red-400"}`}>
            {r.ok ? <Check className="h-4 w-4 shrink-0 text-green-500" aria-label="OK" /> : <X className="h-4 w-4 shrink-0 text-red-500" aria-label="Problem" />}
            <span className="truncate">{r.after}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

export function ConsentPreview() {
  const rows = [
    { state: "Before the choice", items: ["Google Analytics stores _ga", "No Consent Mode signal (gcs=G1--)"], ok: false },
    { state: "After \"Reject all\"", items: ["Meta Pixel stores _fbp"], ok: false },
    { state: "After \"Accept all\"", items: ["Google is told consent was granted (G111)"], ok: true },
  ];
  return (
    <div className="space-y-2 text-sm">
      {rows.map((r) => (
        <div key={r.state} className="rounded-lg border px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{r.state}</p>
          {r.items.map((i) => (
            <p key={i} className="mt-1 flex items-center gap-1.5">
              {r.ok ? <Check className="h-4 w-4 shrink-0 text-green-500" aria-label="OK" /> : <X className="h-4 w-4 shrink-0 text-red-500" aria-label="Problem" />}
              {i}
            </p>
          ))}
        </div>
      ))}
    </div>
  );
}

export const DotPattern = () => (
  <div className="pointer-events-none absolute inset-0 opacity-10" aria-hidden>
    <div className="absolute inset-0" style={{ backgroundImage: "radial-gradient(circle at 2px 2px, hsl(var(--accent)) 1px, transparent 0)", backgroundSize: "32px 32px" }} />
  </div>
);


/** Questions as native <details>, so the answers are in the prerendered HTML and work without JavaScript. */
export function Faq({ items }: { items: { q: string; a: string }[] }) {
  return (
    <div className="divide-y rounded-xl border bg-background">
      {items.map((i) => (
        <details key={i.q} className="group px-5 py-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold [&::-webkit-details-marker]:hidden">
            {i.q}
            <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <p className="mt-3 text-muted-foreground">{i.a}</p>
        </details>
      ))}
    </div>
  );
}
