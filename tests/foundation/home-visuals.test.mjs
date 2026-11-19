// Homepage visuals: sample data stays illustrative and consistent, colours stay readable,
// and every component that shows sample numbers says so.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { CATEGORY_COLORS } from '../../src/components/home/categoryColors.ts';
import { HERO_DAYS, HERO_HUMAN_VISITS, HERO_TOP_BOTS } from '../../src/data/homeSample.ts';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const HOME = 'src/components/home/';
const homeFiles = () => readdirSync(new URL(HOME, root)).filter((f) => /\.tsx?$/.test(f)).map((f) => HOME + f);

const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

test('category colours reach WCAG AA (4.5:1) on white', () => {
  for (const [category, c] of Object.entries(CATEGORY_COLORS)) {
    const ratio = 1.05 / (luminance(c.hex) + 0.05);
    assert.ok(ratio >= 4.5, `${category} ${c.hex} contrast ${ratio.toFixed(2)}`);
  }
  assert.deepEqual(Object.keys(CATEGORY_COLORS).sort(), ['agentic', 'citation', 'training']);
});

test('sample numbers are positive integers and top bots fit inside their category totals', () => {
  assert.equal(HERO_DAYS.length, 14);
  for (const day of HERO_DAYS) for (const v of Object.values(day)) assert.ok(Number.isInteger(v) && v > 0);
  assert.ok(Number.isInteger(HERO_HUMAN_VISITS) && HERO_HUMAN_VISITS > 0);
  const totals = {};
  for (const day of HERO_DAYS) for (const [c, v] of Object.entries(day)) totals[c] = (totals[c] ?? 0) + v;
  const used = {};
  for (const b of HERO_TOP_BOTS) used[b.category] = (used[b.category] ?? 0) + b.visits;
  for (const [c, v] of Object.entries(used)) assert.ok(v <= totals[c], `${c}: top bots ${v} > total ${totals[c]}`);
});

test('every homepage component that uses sample data shows the Example data label', () => {
  assert.match(read(HOME + 'BrowserFrame.tsx'), /EXAMPLE_LABEL = "Example data"/);
  for (const file of homeFiles()) {
    const src = read(file);
    if (!src.includes('@/data/homeSample')) continue;
    assert.ok(/<BrowserFrame|<ExampleTag/.test(src), `${file} uses sample data without the Example data label`);
  }
});

test('sample data names no bots (names come from the registry)', () => {
  assert.doesNotMatch(read('src/data/homeSample.ts'), /[A-Za-z]Bot\b|-User\b/);
});

// Jurist-reviewed and sourced statements. They may move (e.g. into <details>), never change.
const REVIEWED = [
  "Storing information on the visitor's device, or gaining access to information already there, needs consent unless it is strictly necessary to transmit a communication or to provide a service the visitor explicitly asked for. Regulators generally do not treat analytics for the site owner as strictly necessary, so CortIQ's browser tracking waits for consent (EDPB Guidelines 2/2023). National laws implement the rule and differ in detail.",
  "Server-side request data (truncated IP, user agent, path) is still personal data. Legitimate interest can support measuring bots and protecting the site when the site owner's balancing test shows the processing is proportionate and minimal.",
  "Server-side adapters truncate IPs on your server and send only bot-like requests. Truncated IPs are cleared after 30 days and records follow the site's retention (default 365 days). EU-hosted.",
  "No cookies, no device fingerprint, no cross-visit profile. A per-tab session ID in sessionStorage after analytics consent.",
  "Adds a salted device hash for a visitor profile and, with marketing consent, ad click IDs. Starts only after analytics consent.",
  "Daily counts of page views, visits and sources. Nothing is stored on the device and no identifier is set. Designed to not require consent, but regulators may treat the script's request as access under ePrivacy Art. 5(3). Whether you need consent where you operate is your assessment.",
  "the site owner confirms a checklist of what the privacy policy must cover. The confirmation is logged with its version and asked again when the checklist changes.",
  "CortIQ already records which country each consent was given from.",
  "CortIQ gives you the tools. The site operator makes the final legal assessment.",
  "Source: TollBit, State of the Bots, Q4 2025, across its publisher network (up from 1 in 200 in Q1 2025).",
  "AI bots (excluding Googlebot) made up 4.2% of HTML requests in 2025 (Cloudflare Radar 2025 Year in Review), and training accounts for nearly 80% of AI crawling (Cloudflare, The crawl-to-click gap).",
  "gclid, fbclid, msclkid, ttclid and li_fat_id are kept only with marketing consent.",
  "Only visits with marketing consent are uploaded.",
  "The file is read in your browser and never uploaded.",
];

test('the homepage keeps every reviewed statement word for word', () => {
  const all = homeFiles().map(read).join('\n').replace(/\s+/g, ' ');
  for (const s of REVIEWED) assert.ok(all.includes(s), `missing or changed: ${s.slice(0, 70)}…`);
});

test('Index.tsx only composes sections', () => {
  const src = read('src/pages/Index.tsx');
  assert.ok(src.split('\n').length < 60, 'Index.tsx should stay a thin composition');
  assert.doesNotMatch(src, /LEGAL_BASES|BANNER_POINTS|<section/);
});

test('tool previews cannot be focused or read out (they are pictures of the tools)', () => {
  const src = read(HOME + 'ToolsSection.tsx');
  const previews = src.match(/<ToolPreview\b/g) ?? [];
  assert.equal(previews.length, 2, 'both tools use ToolPreview');
  assert.match(src, /inert: ""/);
  assert.match(src, /aria-hidden="true"/);
});
