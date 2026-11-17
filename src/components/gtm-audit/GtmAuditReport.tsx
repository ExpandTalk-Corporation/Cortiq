import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { ReportData } from "../../../supabase/functions/_shared/gtm-audit/report";
import type { ConsentStatus, MigrationClass } from "../../../supabase/functions/_shared/gtm-audit/types";
import { MIGRATION_CLASSES } from "../../../supabase/functions/_shared/gtm-audit/types";
import { MIGRATION_LABEL } from "../../../supabase/functions/_shared/gtm-audit/migrate";
import { CONSENT_LABEL } from "../../../supabase/functions/_shared/gtm-audit/sheets";
import type { FindingStatus } from "../../../supabase/functions/_shared/tracking-check/types";

const STATUS: Record<FindingStatus, { label: string; className: string }> = {
  fail: { label: "Problem", className: "bg-red-500/10 text-red-700 dark:text-red-400" },
  warning: { label: "Review", className: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  manual: { label: "Verify", className: "bg-blue-500/10 text-blue-700 dark:text-blue-400" },
  pass: { label: "OK", className: "bg-green-500/10 text-green-700 dark:text-green-400" },
  untestable: { label: "N/A", className: "bg-gray-500/10 text-gray-700 dark:text-gray-400" },
};
const CONSENT_CLASS: Record<ConsentStatus, string> = {
  gated: STATUS.pass.className, google_consent_mode: STATUS.manual.className,
  likely_gated: STATUS.warning.className, not_gated: STATUS.fail.className,
};

interface Props {
  report: ReportData;
  /** Sample data: shows a label and hides the export. */
  sample?: boolean;
}

export function GtmAuditReport({ report, sample }: Props) {
  const [consent, setConsent] = useState<ConsentStatus | "all">("all");
  const [plan, setPlan] = useState<MigrationClass | "all">("all");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const tags = useMemo(
    () => report.tags.filter((t) => (consent === "all" || t.consent === consent) && (plan === "all" || t.migration === plan)),
    [report.tags, consent, plan],
  );
  const findings = report.findings.filter((f) => f.status !== "pass");
  const passed = report.findings.filter((f) => f.status === "pass");

  const download = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const { gtmAuditXlsx } = await import("@/lib/gtmAuditXlsx");
      const url = URL.createObjectURL(await gtmAuditXlsx(report));
      const a = document.createElement("a");
      a.href = url;
      a.download = `gtm-audit-${report.publicId || "container"}.xlsx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch {
      setExportError("The export could not be built. Try again.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            {report.publicId}{sample ? " · sample data" : ""} · evidence level: configuration (container export, not observed live)
          </p>
          <h2 className="text-xl font-semibold">{report.summary.headline}</h2>
        </div>
        {!sample && (
          <div className="flex flex-col items-end gap-1">
            <Button variant="outline" onClick={download} disabled={exporting}>
              <Download className="mr-2 h-4 w-4" aria-hidden /> {exporting ? "Building…" : "Download Excel"}
            </Button>
            {exportError && <p role="alert" className="text-xs text-red-700 dark:text-red-400">{exportError}</p>}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {MIGRATION_CLASSES.filter((c) => report.summary.counts[c] > 0).map((c) => (
          <button key={c} type="button" onClick={() => setPlan(plan === c ? "all" : c)}
            className={`rounded-lg border p-3 text-left transition-colors ${plan === c ? "border-primary bg-primary/5" : ""}`}>
            <div className="text-2xl font-bold">{report.summary.counts[c]}</div>
            <div className="text-xs text-muted-foreground">{MIGRATION_LABEL[c]}</div>
          </button>
        ))}
      </div>

      <section aria-labelledby="gtm-findings" className="space-y-3">
        <h3 id="gtm-findings" className="font-semibold">Findings</h3>
        {findings.map((f) => (
          <Card key={f.checkKey}>
            <CardContent className="space-y-2 p-4">
              <div className="flex items-start gap-3">
                <span className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-semibold uppercase ${STATUS[f.status].className}`}>{STATUS[f.status].label}</span>
                <p className="font-medium leading-snug">{f.title}</p>
              </div>
              <p className="text-sm text-muted-foreground">{f.explanation}</p>
              {f.fix && <p className="text-sm"><strong>What to do:</strong> {f.fix}</p>}
              <ul className="ml-4 list-disc text-sm text-muted-foreground">
                {f.evidence.details.slice(1, 11).map((d, i) => <li key={`${i}-${d}`} className="break-words">{d}</li>)}
                {f.evidence.details.length - 1 > 10 && <li>and {f.evidence.details.length - 1 - 10} more (see Excel export)</li>}
              </ul>
            </CardContent>
          </Card>
        ))}
        {passed.length > 0 && (
          <p className="text-sm text-muted-foreground">OK: {passed.map((f) => f.title).join(" · ")}</p>
        )}
      </section>

      <section aria-labelledby="gtm-tags" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="gtm-tags" className="font-semibold">Tags ({tags.length} of {report.tags.length})</h3>
          <div className="flex flex-wrap gap-1">
            {(["all", "not_gated", "likely_gated", "gated", "google_consent_mode"] as const).map((c) => (
              <Button key={c} size="sm" variant={consent === c ? "default" : "outline"} onClick={() => setConsent(c)}>
                {c === "all" ? "All" : CONSENT_LABEL[c]}
              </Button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/50 text-left">
              <tr><th className="p-2">Tag</th><th className="p-2">Vendor</th><th className="p-2">Triggers</th><th className="p-2">Consent</th><th className="p-2">Plan</th></tr>
            </thead>
            <tbody className="divide-y">
              {tags.map((t) => (
                <tr key={t.id} className={t.paused ? "opacity-60" : ""}>
                  <td className="p-2 align-top"><div className="font-medium">{t.name}</div><div className="text-xs text-muted-foreground">{t.typeLabel}{t.paused ? " · paused" : ""}</div></td>
                  <td className="p-2 align-top">{t.vendorName}</td>
                  <td className="p-2 align-top text-xs">{t.triggers.join(", ") || "—"}</td>
                  <td className="p-2 align-top"><Badge variant="outline" className={CONSENT_CLASS[t.consent]} title={t.consentEvidence}>{CONSENT_LABEL[t.consent]}</Badge></td>
                  <td className="p-2 align-top"><div>{t.migrationLabel}</div><div className="text-xs text-muted-foreground">{t.migrationReason}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
