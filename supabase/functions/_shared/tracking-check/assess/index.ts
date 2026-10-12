import type { AssessInput, Finding, FindingStatus, Priority } from '../types.ts';
import { assessCoverage, assessParameters } from './parameters.ts';
import { assessCsp, assessForms, assessTags } from './tags.ts';
import { assessConsent } from './consent.ts';

const STATUS_ORDER: Record<FindingStatus, number> = { fail: 0, warning: 1, manual: 2, untestable: 3, pass: 4 };
const PRIORITY_ORDER: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

export function assess(input: AssessInput): Finding[] {
  const findings = [
    ...assessCoverage(input),
    ...assessParameters(input),
    ...assessTags(input),
    ...assessCsp(input),
    ...assessForms(input),
    ...assessConsent(input),
  ];
  return findings
    .map((f, i) => ({ f, i }))
    .sort((a, b) => STATUS_ORDER[a.f.status] - STATUS_ORDER[b.f.status]
      || (a.f.priority ? PRIORITY_ORDER[a.f.priority] : 3) - (b.f.priority ? PRIORITY_ORDER[b.f.priority] : 3)
      || a.i - b.i)
    .map(({ f }) => f);
}
