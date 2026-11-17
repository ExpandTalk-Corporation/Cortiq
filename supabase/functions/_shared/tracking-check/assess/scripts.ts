// Script inventory and Subresource Integrity (plan: docs/superpowers/specs/2026-11-11-tracking-check-script-integrity-plan.md, phase B).
// Which external scripts the tested pages run, what loaded them, whether they carry integrity, and their measured hash.
import type { AssessInput, Finding, ScriptOrigin, SiteObservation } from '../types.ts';
import { sriPossibleFor, vendorById, vendorForUrl } from '../../tracking-vendors.ts';
import { MATRIX_STATES, type ScriptRow } from '../report.ts';
import { displayPath, finding, ORIGIN_ORDER, plural, siteKey, stripQueryValues, testablePages, traceOrigin } from './util.ts';

const MAX_ROWS = 300;

const hostOf = (url: string): string => {
  try { return new URL(url).hostname.toLowerCase(); } catch { return ''; }
};

/**
 * One row per external script of the target's testable pages, or undefined when the probe recorded no scripts
 * (observations from before the inventory). Rows are keyed by URL without query values.
 */
export function scriptInventory(site: SiteObservation): ScriptRow[] | undefined {
  const pages = testablePages(site).filter((p) => p.browser?.states.some((s) => s.scripts));
  if (!pages.length) return undefined;
  const own = siteKey(hostOf(site.origin));
  const acc = new Map<string, { row: ScriptRow; origins: Set<ScriptOrigin>; integrity: (string | null)[]; pages: Set<string> }>();
  for (const p of pages) {
    for (const st of p.browser?.states ?? []) {
      if (!st.scripts) continue;
      const initiatorOf = new Map<string, string>();
      for (const r of st.requests) if (r.initiator && !initiatorOf.has(r.url)) initiatorOf.set(r.url, r.initiator);
      // A state whose consent choice could not be made says nothing about when the script loads, but its tags and hashes still count.
      const counts = st.method !== 'not_automated';
      for (const s of st.scripts) {
        const host = hostOf(s.url);
        if (!host) continue;
        const key = stripQueryValues(s.url);
        let a = acc.get(key);
        if (!a) {
          const vendor = vendorForUrl(s.url);
          a = {
            row: {
              url: key, host, vendorId: vendor?.id ?? null, tool: vendor?.name ?? null, firstParty: siteKey(host) === own,
              origin: null, states: [], beforeConsent: false, integrity: null, crossorigin: null, sha256: null, bytes: null,
              sriPossible: sriPossibleFor(s.url), pages: [], pageCount: 0, of: pages.length,
            },
            origins: new Set(), integrity: [], pages: new Set(),
          };
          acc.set(key, a);
        }
        const init = initiatorOf.get(s.url);
        if (init) a.origins.add(traceOrigin(init, initiatorOf));
        if (counts && !a.row.states.includes(st.state)) a.row.states.push(st.state);
        a.integrity.push(s.integrity);
        if (s.integrity && a.row.crossorigin === null) a.row.crossorigin = s.crossorigin;
        if (s.sha256 && !a.row.sha256) a.row.sha256 = s.sha256;
        if (typeof s.bytes === 'number' && a.row.bytes === null) a.row.bytes = s.bytes;
        a.pages.add(displayPath(p.path));
      }
    }
  }
  const rows = [...acc.values()].map(({ row, origins, integrity, pages: seen }) => {
    row.origin = ORIGIN_ORDER.find((o) => origins.has(o)) ?? null;
    row.states = MATRIX_STATES.filter((s) => row.states.includes(s));
    row.beforeConsent = row.states.includes('none') || row.states.includes('reject');
    // A tag counts as protected only when it has integrity on every page it was seen on.
    row.integrity = integrity.every(Boolean) ? integrity[0] : null;
    if (!row.integrity) row.crossorigin = null;
    row.pages = [...seen].slice(0, 10);
    row.pageCount = seen.size;
    return row;
  });
  const rank = (r: ScriptRow) => (r.firstParty ? 3 : r.origin !== 'page' ? 2 : r.integrity ? 1 : 0);
  return rows.sort((a, b) => rank(a) - rank(b) || a.host.localeCompare(b.host) || a.url.localeCompare(b.url)).slice(0, MAX_ROWS);
}

const BEFORE_CONSENT = ' It loads before the visitor has made a cookie choice (or after "Reject all"), so it runs for every visitor.';

function missingFinding(host: string, rows: ScriptRow[]): Finding {
  const n = rows.length;
  const first = rows[0];
  const example = first.url.split('?')[0];
  const before = rows.some((r) => r.beforeConsent);
  const tool = first.tool ? ` (${first.tool})` : '';
  const measured = first.sha256
    ? `\nThis run measured ${first.sha256} for ${example}. Only use it after checking that the file is the one the vendor published: the check cannot tell a genuine file from a modified one.`
    : '';
  return finding({
    scope: 'Scripts', checkKey: `scripts.sri.missing.${host}`, status: 'warning', priority: 'medium',
    title: `${n === 1 ? 'A script' : `${n} scripts`} from ${host} ${n === 1 ? 'loads' : 'load'} without integrity`,
    explanation: `The page source loads ${plural(n, 'script', 'scripts')} from ${host}${tool} without an integrity attribute, so the browser runs whatever that server returns. `
      + 'If the file is changed on the server, by the vendor or by someone who has broken in, the change runs on the site with full access to the page, including what visitors type into forms.'
      + (before ? BEFORE_CONSENT : ''),
    fix: [
      '1. Load a versioned URL whose content never changes (for example lib@3.7.1/lib.min.js rather than lib@latest), so a fixed hash stays valid.',
      '2. Add integrity and crossorigin to the tag:',
      `<script src="${example}" integrity="sha384-…" crossorigin="anonymous"></script>`,
      `Compute the hash from the file you have checked: curl -s ${example} | openssl dgst -sha384 -binary | openssl base64 -A, then write integrity="sha384-<output>". Many CDNs, such as cdnjs and jsDelivr, show the integrity value next to each file.${measured}`,
      '3. The server must answer with Access-Control-Allow-Origin (public CDNs do). Without it the browser refuses the script once crossorigin is set.',
      'If an inline snippet creates the script, set script.integrity and script.crossOrigin = \'anonymous\' before the snippet adds it to the page.',
      'If the vendor updates this file in place at the same URL, a fixed hash blocks it after the next update. Then limit it with the Content-Security-Policy instead: script-src with only the hosts you use, no \'unsafe-eval\', and connect-src with only the hosts scripts may send data to.',
    ].join('\n'),
    typicalOwner: 'developer',
    evidence: {
      pages: [...new Set(rows.flatMap((r) => r.pages))],
      details: rows.slice(0, 10).map((r) => `${r.url}${r.sha256 ? ` (${r.sha256})` : ''}`),
    },
  });
}

function unsupportedFinding(rows: ScriptRow[]): Finding {
  const tools = [...new Set(rows.map((r) => r.tool ?? r.host))];
  const vendors = [...new Set(rows.map((r) => r.vendorId).filter((id): id is string => !!id))].map((id) => vendorById(id)!).filter(Boolean);
  const notes = vendors.map((v) => v.sriNote).filter(Boolean);
  const scriptHosts = [...new Set([...rows.map((r) => r.host), ...vendors.flatMap((v) => v.csp['script-src'] ?? [])])];
  const sendHosts = [...new Set(vendors.flatMap((v) => [...(v.csp['connect-src'] ?? []), ...(v.csp['img-src'] ?? [])]))];
  const before = rows.filter((r) => r.beforeConsent).map((r) => r.tool ?? r.host);
  return finding({
    scope: 'Scripts', checkKey: 'scripts.sri.unsupported', status: 'manual', priority: 'medium',
    title: 'Some third-party scripts cannot use integrity: limit them with the Content-Security-Policy',
    explanation: `${tools.join(', ')} ${tools.length === 1 ? 'loads' : 'load'} from the page source without integrity. `
      + 'These vendors update the file in place at a fixed URL (tag managers, pixels, cookie banner loaders, testing tools), so a fixed hash would block the script after their next update. '
      + 'A change to the file, by the vendor or by someone who has broken into the vendor, runs on the site unchecked.'
      + (notes.length ? ` ${notes.join(' ')}` : '')
      + (before.length ? ` ${[...new Set(before)].join(', ')} ${before.length === 1 ? 'loads' : 'load'} before the visitor has made a cookie choice (or after "Reject all"), so ${before.length === 1 ? 'it runs' : 'they run'} for every visitor.` : ''),
    fix: [
      `1. Keep script-src restrictive: only the hosts you use (here: ${scriptHosts.join(', ')}), no wildcards such as * or https:, or a nonce with 'strict-dynamic'.`,
      '2. Leave out \'unsafe-eval\' unless a tag needs it.',
      sendHosts.length
        ? `3. Limit connect-src and img-src to the hosts these tools send data to (${sendHosts.join(', ')}), so a modified script cannot send form data to a new domain.`
        : '3. Limit connect-src and img-src to the hosts your tools send data to, so a modified script cannot send form data to a new domain.',
      '4. Remove tools nobody uses, and load the rest only after the matching consent where they need it.',
      '5. Run this check regularly, and add a report-to endpoint to the policy so scripts that try to load from new hosts are reported.',
    ].join('\n'),
    typicalOwner: 'developer',
    evidence: { pages: [...new Set(rows.flatMap((r) => r.pages))], details: rows.slice(0, 10).map((r) => `${r.tool ?? r.host}: ${r.url}`) },
  });
}

/** Scripts in the page source without integrity, and the vendors that cannot carry it. Injected scripts are inventory only. */
export function assessScripts({ target }: AssessInput): Finding[] {
  const rows = scriptInventory(target);
  if (!rows) return [];
  const third = rows.filter((r) => !r.firstParty);
  // Without initiators the probe cannot tell a tag in the page source from an injected one: list the scripts, judge nothing.
  if (third.length && third.every((r) => r.origin === null)) return [];
  const pageSource = third.filter((r) => r.origin === 'page');
  const unsupported = pageSource.filter((r) => !r.integrity && !r.sriPossible);
  const missing = pageSource.filter((r) => !r.integrity && r.sriPossible);
  const byHost = new Map<string, ScriptRow[]>();
  for (const r of missing) byHost.set(r.host, [...(byHost.get(r.host) ?? []), r]);
  const out = [...byHost].map(([host, rs]) => missingFinding(host, rs));
  if (unsupported.length) out.push(unsupportedFinding(unsupported));
  if (!missing.length) {
    const withIntegrity = pageSource.filter((r) => r.integrity).length;
    const injected = third.filter((r) => r.origin && r.origin !== 'page').length;
    const parts = [
      withIntegrity ? `${plural(withIntegrity, 'third-party script', 'third-party scripts')} in the page source ${withIntegrity === 1 ? 'carries' : 'carry'} integrity.` : 'The page source loads no third-party script that could carry integrity without it.',
      unsupported.length ? `${plural(unsupported.length, 'script comes', 'scripts come')} from vendors that cannot use a fixed hash; see the Content-Security-Policy advice for them.` : '',
      injected ? `${plural(injected, 'script is', 'scripts are')} loaded by GTM, the cookie banner or another script; these are listed for the inventory only, since whatever loads them decides on integrity.` : '',
    ].filter(Boolean);
    out.push(finding({
      scope: 'Scripts', checkKey: 'scripts.sri.ok', status: 'pass', priority: null,
      title: 'Third-party scripts in the page source that can carry integrity have it',
      explanation: parts.join(' '),
      fix: '', typicalOwner: null,
      evidence: { details: pageSource.filter((r) => r.integrity).slice(0, 10).map((r) => r.url) },
    }));
  }
  return out;
}
