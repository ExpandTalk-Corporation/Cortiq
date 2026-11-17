/**
 * audit — the one entry point the page and the tests call. Parses, identifies, runs the rules and
 * classifies every tag. Never throws: unexpected shapes become a ParseError.
 */
import type { AuditResult, AuditSummary, Container, MigrationClass, ParseError, TagInfo, TagRow } from './types.ts';
import { MIGRATION_CLASSES } from './types.ts';
import { isParseError, parse } from './parse.ts';
import { tagInfos } from './info.ts';
import { runRules } from './rules/index.ts';
import { missingConsent } from './rules/consent.ts';
import { isActive, plural, typeLabel } from './rules/finding.ts';
import { MIGRATION_LABEL, migrate, migrationContext } from './migrate.ts';

export const ENGINE_VERSION = 1;

function rows(container: Container, infos: TagInfo[]): TagRow[] {
  const ctx = migrationContext(container, infos);
  const triggerName = new Map(container.triggers.map((t) => [t.id, t.name]));
  const folderName = new Map(container.folders.map((f) => [f.id, f.name]));
  return infos.map((i) => {
    const { migration, reason } = migrate(i, ctx);
    return {
      id: i.tag.id,
      name: i.tag.name || 'Unnamed tag',
      typeLabel: i.template?.name || typeLabel(i.tag.type),
      vendorId: i.vendor?.id ?? null,
      vendorName: i.vendor?.name ?? 'Unidentified',
      triggers: i.tag.firingTriggerIds.map((id) => triggerName.get(id) || `Trigger ${id}`),
      consent: i.consent,
      consentEvidence: i.consentEvidence,
      modifiedAt: i.tag.modifiedAt,
      migration,
      migrationLabel: MIGRATION_LABEL[migration],
      migrationReason: reason,
      folder: (i.tag.folderId && folderName.get(i.tag.folderId)) || '',
      paused: i.tag.paused,
    };
  });
}

function summary(infos: TagInfo[], tags: TagRow[]): AuditSummary {
  const counts = Object.fromEntries(MIGRATION_CLASSES.map((c) => [c, 0])) as Record<MigrationClass, number>;
  for (const t of tags) counts[t.migration] += 1;
  const noConsent = missingConsent(infos).length;
  const identifies = infos.filter((i) => isActive(i) && i.vendor?.identifiesVisitors).length;
  const removal = counts.remove;
  const headline = [
    `${noConsent} of ${plural(tags.length, 'tag')} ${noConsent === 1 ? 'has' : 'have'} no consent condition`,
    `${identifies} ${identifies === 1 ? 'identifies' : 'identify'} visitors`,
    plural(removal, 'removal candidate'),
  ].join(' · ');
  return { headline, tags: tags.length, noConsent, identifies, removal, counts };
}

export function audit(input: unknown): AuditResult | ParseError {
  const parsed = parse(input);
  if (isParseError(parsed)) return parsed;
  try {
    const infos = tagInfos(parsed);
    const tags = rows(parsed, infos);
    return { container: parsed, tags, findings: runRules(parsed, infos), summary: summary(infos, tags) };
  } catch {
    return { error: 'not_gtm', message: 'The audit could not read this container. Export it again from GTM (Admin → Export container) and try once more.' };
  }
}
