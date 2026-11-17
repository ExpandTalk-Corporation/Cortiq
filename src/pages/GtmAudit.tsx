import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import PublicLayout from "@/components/PublicLayout";
import { Dropzone } from "@/components/gtm-audit/Dropzone";
import { GtmAuditReport } from "@/components/gtm-audit/GtmAuditReport";
import { GTM_AUDIT_SAMPLE } from "@/data/gtmAuditSample";
import { sendAuditStats } from "@/lib/gtmAuditStats";
import { useSEO } from "@/hooks/useSEO";
import { seoFor } from "@/marketing-routes";
import { audit } from "../../supabase/functions/_shared/gtm-audit/audit";
import { MAX_FILE_BYTES } from "../../supabase/functions/_shared/gtm-audit/parse";
import { buildStats } from "../../supabase/functions/_shared/gtm-audit/stats";
import { reportData, type ReportData } from "../../supabase/functions/_shared/gtm-audit/report";

export default function GtmAudit() {
  useSEO(seoFor("/gtm-audit/"));
  const [report, setReport] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [gen, setGen] = useState(0);
  const requestId = useRef(0);

  const onFile = async (file: File) => {
    const id = ++requestId.current;
    setError(null);
    if (file.size > MAX_FILE_BYTES) {
      if (id === requestId.current) { setError("The file is larger than 5 MB. Export a single container version from GTM."); setReport(null); }
      return;
    }
    setBusy(true);
    try {
      const text = await file.text();
      const result = audit(text);
      if (id !== requestId.current) return;
      if ("error" in result) { setError(result.message); setReport(null); return; }
      setReport(reportData(result));
      setGen((g) => g + 1);
      void sendAuditStats(buildStats(result));
    } catch {
      if (id === requestId.current) { setError("The file could not be read."); setReport(null); }
    } finally {
      if (id === requestId.current) setBusy(false);
    }
  };

  return (
    <PublicLayout>
      <section className="container mx-auto max-w-5xl px-4 py-12 sm:py-16">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">GTM container audit</h1>
        <p className="mt-3 max-w-3xl text-lg text-muted-foreground">
          See which tags have no consent condition, which tools identify visitors, what is duplicated, paused or
          years old — and which tags CortIQ already covers if you want to measure without Google Tag Manager.
        </p>
        <p className="mt-3 flex max-w-3xl items-start gap-2 text-sm text-muted-foreground">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            The file never leaves your browser: the audit runs on this page. We count anonymous totals — how many files,
            tag types, known vendors and findings — never tag names, container IDs, domains or URLs.
          </span>
        </p>
        <div className="mt-8">
          <Dropzone onFile={onFile} busy={busy} />
          {error && <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-400">{error}</p>}
        </div>
      </section>

      <section id="report" className="container mx-auto max-w-5xl px-4 pb-12">
        {report ? (
          <GtmAuditReport key={gen} report={report} />
        ) : (
          <>
            <h2 className="mb-4 text-lg font-semibold text-muted-foreground">Sample report (synthetic container)</h2>
            <GtmAuditReport report={GTM_AUDIT_SAMPLE} sample />
          </>
        )}
      </section>

      <section className="container mx-auto max-w-5xl px-4 pb-16">
        <div className="rounded-xl border bg-muted/30 p-6">
          <h2 className="text-xl font-semibold">What the audit can and cannot see</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            It reads the container configuration. A consent check inside a Custom JavaScript variable, or a tag the site
            loads outside GTM, does not show up here. To see what actually loads before and after the banner, run the{" "}
            <Link to="/tracking-check/" className="underline">Tracking Check</Link> on the live site.
          </p>
          <Button asChild className="mt-4">
            <Link to="/auth">Measure without GTM with CortIQ <ArrowRight className="ml-2 h-4 w-4" aria-hidden /></Link>
          </Button>
        </div>
      </section>
    </PublicLayout>
  );
}
