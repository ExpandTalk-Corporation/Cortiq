/**
 * Anonymous usage counters for the public GTM audit. Built in the browser from a whitelist and
 * re-validated by the gtm-audit-stats edge function with the same code: engine version, a tag-count
 * bucket, and counts per GTM tag type, registry vendor id, check key and migration class.
 * Never names, container IDs, domains, URLs or HTML.
 */
import type { AuditResult } from './types.ts';
import { CHECK_KEYS, MIGRATION_CLASSES } from './types.ts';
import { KNOWN_TYPES } from './tag-types.ts';
import { ENGINE_VERSION } from './audit.ts';
import { TRACKING_VENDORS } from '../tracking-vendors.ts';

export const BUCKETS = ['1-10', '11-25', '26-50', '51-100', '101-250', '250+'] as const;
export type Bucket = typeof BUCKETS[number];
export const MAX_COUNT = 500;

export interface AuditStats {
  v: number;
  bucket: Bucket;
  types: Record<string, number>;
  vendors: Record<string, number>;
  checks: Record<string, number>;
  migration: Record<string, number>;
}

const ALLOWED = {
  types: new Set([...KNOWN_TYPES, 'template', 'other']),
  vendors: new Set([...TRACKING_VENDORS.map((v) => v.id), 'unknown']),
  checks: new Set<string>(CHECK_KEYS),
  migration: new Set<string>(MIGRATION_CLASSES),
};
const MAPS = ['types', 'vendors', 'checks', 'migration'] as const;

export function bucketOf(n: number): Bucket {
  if (n <= 10) return '1-10';
  if (n <= 25) return '11-25';
  if (n <= 50) return '26-50';
  if (n <= 100) return '51-100';
  if (n <= 250) return '101-250';
  return '250+';
}

const bump = (m: Record<string, number>, k: string) => { m[k] = Math.min((m[k] ?? 0) + 1, MAX_COUNT); };

export function buildStats(result: AuditResult): AuditStats {
  const s: AuditStats = { v: ENGINE_VERSION, bucket: bucketOf(result.tags.length), types: {}, vendors: {}, checks: {}, migration: {} };
  for (const t of result.container.tags) {
    bump(s.types, ALLOWED.types.has(t.type) ? t.type : t.type.startsWith('cvt_') ? 'template' : 'other');
  }
  for (const row of result.tags) {
    bump(s.vendors, row.vendorId && ALLOWED.vendors.has(row.vendorId) ? row.vendorId : 'unknown');
    bump(s.migration, row.migration);
  }
  for (const f of result.findings) if (f.status !== 'pass') bump(s.checks, f.checkKey);
  return s;
}

/** Same whitelist on both sides. Returns a clean copy (counts capped) or null. */
export function validateStats(x: unknown): AuditStats | null {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
  const o = x as Record<string, unknown>;
  const keys = Object.keys(o);
  if (keys.length !== 6 || !['v', 'bucket', ...MAPS].every((k) => keys.includes(k))) return null;
  if (!Number.isInteger(o.v) || (o.v as number) < 1 || (o.v as number) > ENGINE_VERSION) return null;
  if (!(BUCKETS as readonly unknown[]).includes(o.bucket)) return null;
  const out: AuditStats = { v: o.v as number, bucket: o.bucket as Bucket, types: {}, vendors: {}, checks: {}, migration: {} };
  for (const name of MAPS) {
    const m = o[name];
    if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
    for (const [k, c] of Object.entries(m as Record<string, unknown>)) {
      if (!ALLOWED[name].has(k) || !Number.isInteger(c) || (c as number) < 0) return null;
      if ((c as number) > 0) out[name][k] = Math.min(c as number, MAX_COUNT);
    }
  }
  return out;
}

const PREFIX = { types: 'type', vendors: 'vendor', checks: 'check', migration: 'migration' } as const;

/** Rows for gtm_audit_stats_daily: files, bucket:<b>, type:<t>, vendor:<id>, check:<key>, migration:<class>. */
export function statsRows(s: AuditStats): { keys: string[]; counts: number[] } {
  const keys = ['files', `bucket:${s.bucket}`];
  const counts = [1, 1];
  for (const name of MAPS) {
    for (const [k, c] of Object.entries(s[name])) { keys.push(`${PREFIX[name]}:${k}`); counts.push(c); }
  }
  return { keys, counts };
}
