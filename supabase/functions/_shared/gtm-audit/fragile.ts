/**
 * fragile — tags that depend on page markup instead of a named event: CSS-selector and Click/Form
 * class/ID/text conditions, Element Visibility selectors, DOM Element variables and Custom JavaScript
 * variables that read the page. Reached through firing triggers (groups included) and variable chains.
 */
import type { Container, GtmTrigger, GtmVariable, ParamValue, TagInfo } from './types.ts';
import { firingTriggers, varsUsedBy } from './refs.ts';
import { isActive } from './rules/finding.ts';

export interface FragileUse { tag: TagInfo; source: string }

const DOM_ARGS = new Set(['{{Click Classes}}', '{{Click ID}}', '{{Click Text}}', '{{Form Classes}}', '{{Form ID}}', '{{Form Text}}']);
const READS_PAGE = /querySelector|getElementById|getElementsBy|innerText|textContent|\$\(|jQuery\(/;
const KIND: Record<string, string> = { CLICK: 'click trigger', LINK_CLICK: 'link click trigger', FORM_SUBMISSION: 'form trigger', ELEMENT_VISIBILITY: 'element visibility trigger' };
const MAX_JS = 200_000;
const MAX_SHOWN = 100;

const text = (v: ParamValue | undefined): string => (typeof v === 'string' ? v : '');
const shown = (s: string): string => (s.length > MAX_SHOWN ? `${s.slice(0, MAX_SHOWN)}…` : s);

function triggerSources(t: GtmTrigger): string[] {
  const label = `${Object.prototype.hasOwnProperty.call(KIND, t.type) ? KIND[t.type] : 'trigger'} "${t.name}"`;
  const out: string[] = [];
  for (const c of t.conditions) {
    if (c.type === 'CSS_SELECTOR') out.push(`${label} matches CSS selector "${shown(c.arg1)}"`);
    else if (DOM_ARGS.has(c.arg0)) out.push(`${label} checks ${c.arg0.slice(2, -2)} "${shown(c.arg1)}"`);
  }
  if (t.type === 'ELEMENT_VISIBILITY') {
    const sel = text(t.params.elementSelector) || text(t.params.elementId);
    if (sel) out.push(`${label} watches "${shown(sel)}"`);
  }
  return out;
}

function variableSource(v: GtmVariable): string | null {
  if (v.type === 'd') return `DOM element variable "{{${v.name}}}"`;
  if (v.type === 'jsm' && READS_PAGE.test(text(v.params.javascript).slice(0, MAX_JS))) return `Custom JavaScript variable "{{${v.name}}}" reads the page`;
  return null;
}

export function fragileUses(container: Container, infos: TagInfo[]): FragileUse[] {
  const out: FragileUse[] = [];
  for (const i of infos) {
    if (!isActive(i)) continue;
    const sources = new Set<string>();
    for (const t of firingTriggers(i.tag, container)) for (const s of triggerSources(t)) sources.add(s);
    for (const v of varsUsedBy(i.tag, container)) { const s = variableSource(v); if (s) sources.add(s); }
    for (const source of sources) out.push({ tag: i, source });
  }
  return out;
}
