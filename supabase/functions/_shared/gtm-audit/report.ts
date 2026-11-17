/** What the page, the Excel export and the committed sample see: rows only, never raw tag HTML. */
import type { Finding } from '../tracking-check/types.ts';
import type { AuditResult, AuditSummary, TagRow } from './types.ts';

export interface TriggerRow { name: string; type: string; tags: number; folder: string; builtIn: boolean }
export interface VariableRow { name: string; type: string }

export interface ReportData {
  publicId: string;
  exportedAt: number | null;
  summary: AuditSummary;
  findings: Finding[];
  tags: TagRow[];
  triggers: TriggerRow[];
  variables: VariableRow[];
}

export function reportData(result: AuditResult): ReportData {
  const c = result.container;
  const folderName = new Map(c.folders.map((f) => [f.id, f.name]));
  const uses = new Map<string, number>();
  for (const t of c.tags) for (const id of new Set([...t.firingTriggerIds, ...t.blockingTriggerIds])) uses.set(id, (uses.get(id) ?? 0) + 1);
  return {
    publicId: c.publicId,
    exportedAt: c.exportedAt,
    summary: result.summary,
    findings: result.findings,
    tags: result.tags,
    triggers: c.triggers.map((t) => ({
      name: t.name, type: t.type, tags: uses.get(t.id) ?? 0,
      folder: (t.folderId && folderName.get(t.folderId)) || '', builtIn: t.builtIn,
    })),
    variables: c.variables.map((v) => ({ name: v.name, type: v.type })),
  };
}
