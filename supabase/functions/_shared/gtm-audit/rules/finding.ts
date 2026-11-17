import type { Finding, FindingStatus, Owner, Priority } from '../../tracking-check/types.ts';
import type { CheckKey, TagInfo } from '../types.ts';
import { TYPE_LABEL } from '../tag-types.ts';

export const EVIDENCE_LEVEL = 'Evidence level: configuration (container export, not observed live)';
const MAX_DETAILS = 200;

export const isActive = (i: TagInfo): boolean => !i.tag.paused && i.tag.firingTriggerIds.length > 0;

export const typeLabel = (type: string): string =>
  (Object.prototype.hasOwnProperty.call(TYPE_LABEL, type) ? TYPE_LABEL[type] : type.startsWith('cvt_') ? 'Custom template' : type || 'Unknown type');

export const tagLabel = (i: TagInfo): string =>
  `${i.tag.name || 'Unnamed tag'} (${i.vendor?.name ?? (i.template?.name || typeLabel(i.tag.type))})`;

export const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

export function finding(
  checkKey: CheckKey, title: string, status: FindingStatus, priority: Priority, owner: Owner,
  explanation: string, fix: string, details: string[],
): Finding {
  const pass = status === 'pass';
  return {
    scope: 'GTM', checkKey, title, status,
    priority: pass ? null : priority, explanation, fix: pass ? '' : fix, typicalOwner: pass ? null : owner,
    evidence: { pages: [], details: [EVIDENCE_LEVEL, ...details.slice(0, MAX_DETAILS)] },
  };
}
