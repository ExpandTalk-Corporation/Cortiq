# Visual homepage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the text-heavy homepage (`src/pages/Index.tsx`) into a visual one: a dashboard mockup in the hero, coloured category cards, the real Tracking Check and GTM Audit reports as previews, the real consent banner in a sandboxed iframe, and flow/status visuals for attribution and operations. No public claim is removed.

**Architecture:** `Index.tsx` becomes a thin composition of section components in `src/components/home/`. Mockups are static SVG/Tailwind (no Recharts, because SSG prerender) wrapped in a shared `BrowserFrame` that carries an "Example data" label. All mockup numbers live in `src/data/homeSample.ts`, and all bot names come from the registry. The banner demo is a static `public/banner-demo/` page loaded in an `<iframe sandbox="allow-scripts">`.

**Tech Stack:** React 18, TypeScript, Vite SSG prerender (`scripts/prerender.mjs`), Tailwind, shadcn/ui, lucide-react, Node 24 `node:test` (type stripping lets tests import `.ts` files that only use `import type`).

**Spec:** `docs/superpowers/specs/2026-11-19-visual-homepage-design.md`

## Global Constraints

- Branch `feat/visual-homepage` (exists, spec committed as 4253853). Commit after every task. Commit messages end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Do not modify `public/consent-banner.js`, `public/cortiq.js`, `src/lib/sri-manifest.json` or anything under `public/v/`.
- Bot names only from the registry (`botsInCategory()` in `src/lib/aiBotRegistry.ts`). Never type a bot name into homepage code or sample data.
- Every component that imports `@/data/homeSample` renders `<BrowserFrame` or `<ExampleTag` (label text exactly `Example data`).
- No Recharts on the homepage. Charts are inline `<svg>` or Tailwind divs. Number formatting always uses `toLocaleString("en-US")` so SSR and client output match.
- Jurist-reviewed copy (legal bases, measurement modes, legal notes) stays word for word. It may move into `<details>` but is never edited. Short card lines may only restate what the full text says.
- Copy rules from CLAUDE.md: "designed to not require consent" (never "GDPR-compliant without consent" / "no banner needed"); cookieless = "sessionStorage after consent" (never "nothing stored").
- No third-party logos. Platforms are text labels.
- The public site is light-only. Category text colours must reach a WCAG AA contrast of 4.5:1 or more on white.
- Code and UI copy are in English.
- Run a single test file with `node --test tests/foundation/<file>.test.mjs`, and all tests with `npm run test:foundation`.

## Review Focus

1. **Keyboard and screen-reader users reach the scaled report previews.** Expected: Tab skips them (they are `inert` + `aria-hidden`). Test in Task 5.
2. **`/banner-demo/?lang=` with an unknown or hostile value** (`xx`, `"><script>`). Expected: falls back to `en`, and the value is never written into the page. Test in Task 6.
3. **The banner inside the opaque-origin sandbox, where storage access throws.** Expected: the banner still renders, and clicking a choice sends no request. Test in Task 6 (VM). Real browser check in Task 9.
4. **Hydration mismatch from mockup maths or number formatting.** Expected: no React #418/#423 at `/`. Guarded by deterministic sample data + `en-US` formatting (Task 1/3). Browser check in Task 9.
5. **Mobile width (390 px).** Expected: the hero mockup stacks under the copy, the iframe does not clip the banner's buttons, the flow chain wraps vertically, and there is no horizontal scroll. Checked in Task 9. The iframe height is set in Task 7.

---

### Task 1: Shared visual primitives and sample data

**Files:**
- Create: `src/components/home/categoryColors.ts`
- Create: `src/components/home/botNames.ts`
- Create: `src/components/home/BrowserFrame.tsx`
- Create: `src/components/home/Sparkline.tsx`
- Create: `src/components/home/SectionHeader.tsx`
- Create: `src/data/homeSample.ts`
- Create: `tests/foundation/home-visuals.test.mjs`
- Modify: `tests/foundation/marketing-bot-claims.test.mjs:10-15`

**Interfaces:**
- Produces:
  - `CATEGORY_COLORS: Record<BotCategory, { hex: string; text: string; bg: string }>`
  - `botNames(category: BotCategory): string[]` (unique, registry order), `examplesFor(category: BotCategory): string` (first 4 joined by ", ")
  - `BrowserFrame({ title?: string; className?: string; children: ReactNode })`, `ExampleTag({ className?: string })`, `EXAMPLE_LABEL = "Example data"`
  - `Sparkline({ values: number[]; color: string; label: string })`
  - `SectionHeader({ eyebrow: string; title: string; intro: string })`
  - `HERO_DAYS: Record<BotCategory, number>[]` (14 days), `HERO_HUMAN_VISITS: number`, `HERO_TOP_BOTS: { category: BotCategory; index: number; visits: number }[]`, `ATTRIBUTION_FLOW: string[]`, `CONVERSION_BARS: { label: string; value: number }[]`, `STATUS_ROWS: { label: string; value: string }[]`, `PLATFORMS: string[]`

- [ ] **Step 1: Write the failing tests**

Create `tests/foundation/home-visuals.test.mjs`:

```js
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
```

In `tests/foundation/marketing-bot-claims.test.mjs`, replace the `files` array (lines 10-15) with:

```js
const files = [
  ...readdirSync(new URL('src/pages/', root)).filter(f => f.endsWith('.tsx')).map(f => `src/pages/${f}`),
  ...readdirSync(new URL('src/content/', root)).filter(f => f.endsWith('.ts')).map(f => `src/content/${f}`),
  ...readdirSync(new URL('src/components/home/', root)).filter(f => /\.tsx?$/.test(f)).map(f => `src/components/home/${f}`),
  'src/data/homeSample.ts',
  'public/llms.txt',
  'public/llms-full.txt',
];
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/foundation/home-visuals.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `categoryColors.ts`.

- [ ] **Step 3: Implement the primitives**

`src/components/home/categoryColors.ts`:

```ts
import type { BotCategory } from "@/lib/aiBotRegistry";

// One colour per AI traffic category, used for every chart, icon and legend on the homepage.
// Text colours are AA on white (checked in tests/foundation/home-visuals.test.mjs).
export const CATEGORY_COLORS: Record<BotCategory, { hex: string; text: string; bg: string }> = {
  training: { hex: "#dc2626", text: "text-red-600", bg: "bg-red-600" },
  agentic: { hex: "#15803d", text: "text-green-700", bg: "bg-green-700" },
  citation: { hex: "#2563eb", text: "text-blue-600", bg: "bg-blue-600" },
};
```

`src/components/home/botNames.ts`:

```ts
import { botsInCategory, type BotCategory } from "@/lib/aiBotRegistry";

// Bot names on the homepage come from the ingest registry, so the page only names bots CortIQ classifies.
export const botNames = (category: BotCategory): string[] => [...new Set(botsInCategory(category).map((b) => b.name))];

export const examplesFor = (category: BotCategory): string => botNames(category).slice(0, 4).join(", ");
```

`src/components/home/BrowserFrame.tsx`:

```tsx
import type { ReactNode } from "react";

export const EXAMPLE_LABEL = "Example data";

export function ExampleTag({ className = "" }: { className?: string }) {
  return (
    <span className={`rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground ${className}`}>
      {EXAMPLE_LABEL}
    </span>
  );
}

/** A browser-window frame for product mockups. Always carries the Example data label. */
export function BrowserFrame({ title, className = "", children }: { title?: string; className?: string; children: ReactNode }) {
  return (
    <figure className={`overflow-hidden rounded-xl border bg-background shadow-xl ${className}`}>
      <div className="flex items-center gap-1.5 border-b bg-muted/40 px-3 py-2">
        <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-red-400" />
        <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-amber-400" />
        <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-green-500" />
        {title && <span className="ml-2 truncate text-xs text-muted-foreground">{title}</span>}
        <ExampleTag className="ml-auto shrink-0" />
      </div>
      {children}
    </figure>
  );
}
```

`src/components/home/Sparkline.tsx`:

```tsx
/** A static trend line. Pure SVG, so it prerenders identically on the server and in the browser. */
export function Sparkline({ values, color, label }: { values: number[]; color: string; label: string }) {
  if (values.length < 2) return null;
  const W = 120;
  const H = 32;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const points = values
    .map((v, i) => `${((i / (values.length - 1)) * W).toFixed(1)},${(H - 2 - ((v - min) / span) * (H - 4)).toFixed(1)}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-8 w-28" role="img" aria-label={label}>
      <polyline points={points} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
```

`src/components/home/SectionHeader.tsx` (moved unchanged from `Index.tsx:126-132`):

```tsx
export const SectionHeader = ({ eyebrow, title, intro }: { eyebrow: string; title: string; intro: string }) => (
  <div className="max-w-3xl mx-auto text-center mb-12">
    <p className="text-sm font-semibold uppercase tracking-wide text-primary mb-3">{eyebrow}</p>
    <h2 className="text-3xl md:text-4xl font-bold mb-4">{title}</h2>
    <p className="text-lg text-muted-foreground leading-relaxed">{intro}</p>
  </div>
);
```

`src/data/homeSample.ts`:

```ts
import type { BotCategory } from "@/lib/aiBotRegistry";

// Illustrative numbers for the homepage mockups. Every component that renders them shows
// "Example data". Bot names are resolved from the registry by category + index, never typed here.

export const HERO_DAYS: Record<BotCategory, number>[] = [
  { training: 48, agentic: 10, citation: 20 },
  { training: 52, agentic: 12, citation: 22 },
  { training: 45, agentic: 9, citation: 18 },
  { training: 60, agentic: 14, citation: 25 },
  { training: 55, agentic: 13, citation: 24 },
  { training: 50, agentic: 11, citation: 21 },
  { training: 47, agentic: 8, citation: 19 },
  { training: 58, agentic: 15, citation: 26 },
  { training: 62, agentic: 16, citation: 27 },
  { training: 49, agentic: 12, citation: 22 },
  { training: 53, agentic: 10, citation: 20 },
  { training: 57, agentic: 14, citation: 25 },
  { training: 51, agentic: 13, citation: 23 },
  { training: 46, agentic: 11, citation: 21 },
];

export const HERO_HUMAN_VISITS = 37000;

export const HERO_TOP_BOTS: { category: BotCategory; index: number; visits: number }[] = [
  { category: "training", index: 0, visits: 410 },
  { category: "citation", index: 0, visits: 230 },
  { category: "training", index: 1, visits: 150 },
  { category: "agentic", index: 0, visits: 120 },
];

export const ATTRIBUTION_FLOW = ["Ad click", "Visit", "Form", "HubSpot", "Qualified lead", "Google Ads"];

export const CONVERSION_BARS = [
  { label: "Conversions from consented visits", value: 48 },
  { label: "Qualified in HubSpot", value: 21 },
  { label: "Uploaded to Google Ads", value: 21 },
];

export const STATUS_ROWS = [
  { label: "Site", value: "Up · checked 2 min ago" },
  { label: "CortIQ snippet", value: "Found on the home page" },
  { label: "Script integrity", value: "Pinned version, SRI hash matches" },
];

export const PLATFORMS = ["WordPress", "Next.js", "Netlify", "Cloudflare", "Node", "PHP", "GTM"];
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/foundation/home-visuals.test.mjs tests/foundation/marketing-bot-claims.test.mjs`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/home src/data/homeSample.ts tests/foundation/home-visuals.test.mjs tests/foundation/marketing-bot-claims.test.mjs
git commit -m "feat(home): visual primitives, category colours and sample data"
```

---

### Task 2: Split the homepage into section components (no visual change)

This task only moves code. The rendered text must stay byte-for-byte the same.

**Files:**
- Create: `src/components/home/copy.ts`
- Create: `src/components/home/HeroSection.tsx`, `AiTrafficSection.tsx`, `ToolsSection.tsx`, `ConsentSection.tsx`, `AttributionSection.tsx`, `OperationsSection.tsx`, `ClosingCta.tsx`
- Modify: `src/pages/Index.tsx` (whole file)
- Test: `tests/foundation/home-visuals.test.mjs`

**Interfaces:**
- Consumes: `SectionHeader`, `examplesFor` (Task 1)
- Produces: `copy.ts` exports `BANNER_POINTS`, `MODES` (`{ title; short; text }[]`), `LEGAL_BASES`, `LEGAL_DOCS`, `LEGAL_NOTES` (`{ lead: string; text: string }[]`), `ATTRIBUTION`, `OPERATIONS` (`{ id: "server" | "uptime" | "sri" | "api"; title; text }[]`). Each section file has a named export with the file's name (for example `export function HeroSection()`), and none of them takes props.

- [ ] **Step 1: Record the baseline text of the current homepage**

Create the helper `$TMP/home-text.cjs`:

```js
// Usage: node home-text.cjs dist/index.html [--visible]  → prints the page text (or the visible word count)
const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');
let body = html.slice(html.indexOf('<body'));
body = body.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
if (process.argv.includes('--visible')) body = body.replace(/<details[\s\S]*?<\/summary>([\s\S]*?)<\/details>/g, ' ');
const text = body.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ').replace(/\s+/g, ' ').trim();
console.log(process.argv.includes('--visible') ? text.split(' ').length : text);
```

Run:

```bash
git stash -u -q 2>/dev/null; npm run build >/dev/null && node "$TMP/home-text.cjs" dist/index.html > "$TMP/home-before.txt" && node "$TMP/home-text.cjs" dist/index.html --visible > "$TMP/home-before-words.txt"; git stash pop -q 2>/dev/null; wc -c "$TMP/home-before.txt"; cat "$TMP/home-before-words.txt"
```

Expected: a non-empty text file that contains "Every AI visit, classified." (if it does not, find which file `scripts/prerender.mjs` writes for `/` and use that path instead), and a word count. Keep both files for Task 2 Step 5 and Task 9.

- [ ] **Step 2: Write the failing test**

Append to `tests/foundation/home-visuals.test.mjs`:

```js
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
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --test tests/foundation/home-visuals.test.mjs`
Expected: FAIL on "keeps every reviewed statement" (the text is still in `src/pages/Index.tsx`) and on "only composes sections".

- [ ] **Step 4: Move the code**

1. Create `src/components/home/copy.ts` by moving the constants `BANNER_POINTS`, `MODES`, `LEGAL_BASES`, `LEGAL_DOCS`, `ATTRIBUTION` and `OPERATIONS` from `Index.tsx:48-125` **verbatim**, with these mechanical changes only:
   - `OPERATIONS` drops `icon` and gains `id`, in order: `"server"`, `"uptime"`, `"sri"`, `"api"`.
   - `MODES` gains a `short` field (used from Task 7; not rendered yet):
     - Cookieless: `"No cookies or fingerprint. Session ID in sessionStorage after consent."`
     - Full: `"Visitor profile and, with marketing consent, ad click IDs. After analytics consent."`
     - Aggregate (opt-in): `"Daily counts with no identifier on the device. Opt-in per site."`
   - Add `LEGAL_NOTES`, built from the JSX at `Index.tsx:340-348`:

```ts
export const LEGAL_NOTES = [
  {
    lead: "Before the install code is shown,",
    text: "the site owner confirms a checklist of what the privacy policy must cover. The confirmation is logged with its version and asked again when the checklist changes.",
  },
  {
    lead: "In development:",
    text: "rules per jurisdiction (EU/EEA, UK, US states, Brazil, Canada). CortIQ already records which country each consent was given from.",
  },
  { lead: "", text: "CortIQ gives you the tools. The site operator makes the final legal assessment." },
];
```

2. Move each `<section>` from `Index.tsx` into its own file, unchanged. Each component returns exactly the `<section>…</section>` it had, with the imports it needs:
   - `HeroSection.tsx`: the `<section>` starting at line 143, plus the seven hero image imports and `Badge`, `Button`, `Link`, `ArrowRight`, `ShieldCheck`, `Shield`, `Cookie`, `Code`.
   - `AiTrafficSection.tsx`: the `<section>` at line 204, plus `CATEGORY_STYLE` (lines 39-43) and `examplesFor` from `./botNames`.
   - `ToolsSection.tsx`: the `<section>` at line 246.
   - `ConsentSection.tsx`: the `<section>` at line 291. Render `LEGAL_NOTES` as `<p>{n.lead && <strong className="text-foreground">{n.lead}</strong>} {n.text}</p>` inside the same `div`.
   - `AttributionSection.tsx`: the `<section>` at line 369.
   - `OperationsSection.tsx`: the `<section>` at line 394. Map icons by id: `const OPERATION_ICONS: Record<string, LucideIcon> = { server: Server, uptime: Activity, sri: Lock, api: Code };`.
   - `ClosingCta.tsx`: the `<section>` at line 419.

3. Replace `src/pages/Index.tsx` with:

```tsx
import { useSEO } from "@/hooks/useSEO";
import { seoFor } from "@/marketing-routes";
import PublicNavigation from "@/components/PublicNavigation";
import PublicFooter from "@/components/PublicFooter";
import { HeroSection } from "@/components/home/HeroSection";
import { AiTrafficSection } from "@/components/home/AiTrafficSection";
import { ToolsSection } from "@/components/home/ToolsSection";
import { ConsentSection } from "@/components/home/ConsentSection";
import { AttributionSection } from "@/components/home/AttributionSection";
import { OperationsSection } from "@/components/home/OperationsSection";
import { ClosingCta } from "@/components/home/ClosingCta";

const Index = () => {
  useSEO(seoFor("/"));

  return (
    <div className="min-h-screen bg-background">
      <PublicNavigation />
      <HeroSection />
      <AiTrafficSection />
      <ToolsSection />
      <ConsentSection />
      <AttributionSection />
      <OperationsSection />
      <ClosingCta />
      <PublicFooter />
    </div>
  );
};

export default Index;
```

- [ ] **Step 5: Verify the tests pass and the rendered text is unchanged**

Run: `node --test tests/foundation/home-visuals.test.mjs tests/foundation/marketing-bot-claims.test.mjs`
Expected: PASS.

Run: `npm run build >/dev/null && node "$TMP/home-text.cjs" dist/index.html > "$TMP/home-after-split.txt" && diff "$TMP/home-before.txt" "$TMP/home-after-split.txt" && echo SAME`
Expected: `SAME`. One whitespace difference around the legal-note `<strong>` is acceptable. Any word difference is not: fix it before committing.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Index.tsx src/components/home tests/foundation/home-visuals.test.mjs
git commit -m "refactor(home): one component per homepage section, copy in copy.ts"
```

---

### Task 3: Hero dashboard mockup

**Files:**
- Create: `src/components/home/HeroDashboardMock.tsx`
- Modify: `src/components/home/HeroSection.tsx` (container markup)

**Interfaces:**
- Consumes: `BrowserFrame`, `CATEGORY_COLORS`, `botNames`, `HERO_DAYS`, `HERO_HUMAN_VISITS`, `HERO_TOP_BOTS` (Task 1)
- Produces: `HeroDashboardMock()`

- [ ] **Step 1: Run the existing label test against the new file (it fails until the frame is used)**

Create `src/components/home/HeroDashboardMock.tsx` with only:

```tsx
import { HERO_DAYS } from "@/data/homeSample";
export function HeroDashboardMock() { return <div>{HERO_DAYS.length}</div>; }
```

Run: `node --test tests/foundation/home-visuals.test.mjs`
Expected: FAIL with "HeroDashboardMock.tsx uses sample data without the Example data label".

- [ ] **Step 2: Implement the mockup**

Replace `src/components/home/HeroDashboardMock.tsx` with:

```tsx
import { BOT_CATEGORIES, BOT_CATEGORY_META, type BotCategory } from "@/lib/aiBotRegistry";
import { HERO_DAYS, HERO_HUMAN_VISITS, HERO_TOP_BOTS } from "@/data/homeSample";
import { BrowserFrame } from "./BrowserFrame";
import { CATEGORY_COLORS } from "./categoryColors";
import { botNames } from "./botNames";

const fmt = (n: number) => n.toLocaleString("en-US");
const dayTotal = (d: Record<BotCategory, number>) => BOT_CATEGORIES.reduce((sum, c) => sum + d[c], 0);

const BAR = 14;
const GAP = 6;
const H = 100;

/** Product-style dashboard with illustrative numbers. Static SVG, so it prerenders. */
export function HeroDashboardMock() {
  const aiVisits = HERO_DAYS.reduce((sum, d) => sum + dayTotal(d), 0);
  const share = ((aiVisits / (aiVisits + HERO_HUMAN_VISITS)) * 100).toFixed(1);
  const max = Math.max(...HERO_DAYS.map(dayTotal));
  const width = HERO_DAYS.length * (BAR + GAP) - GAP;
  const topBots = HERO_TOP_BOTS
    .map((b) => ({ ...b, name: botNames(b.category)[b.index] }))
    .filter((b): b is typeof b & { name: string } => Boolean(b.name));
  const kpis: [string, string][] = [
    ["AI visits", fmt(aiVisits)],
    ["Human visits", fmt(HERO_HUMAN_VISITS)],
    ["AI share", `${share}%`],
  ];

  return (
    <BrowserFrame title="CortIQ · AI traffic · last 14 days">
      <div className="space-y-4 p-4 sm:p-5">
        <dl className="grid grid-cols-3 gap-3">
          {kpis.map(([label, value]) => (
            <div key={label} className="rounded-lg border p-3">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="text-lg font-bold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        <svg viewBox={`0 0 ${width} ${H}`} className="h-28 w-full" preserveAspectRatio="none" role="img" aria-label="Example chart: AI visits per day, stacked by category">
          {HERO_DAYS.map((d, i) => {
            let y = H;
            return BOT_CATEGORIES.map((c) => {
              const h = (d[c] / max) * H;
              y -= h;
              return <rect key={`${i}-${c}`} x={i * (BAR + GAP)} y={y} width={BAR} height={h} fill={CATEGORY_COLORS[c].hex} />;
            });
          })}
        </svg>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {BOT_CATEGORIES.map((c) => (
            <li key={c} className="flex items-center gap-1.5">
              <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-sm ${CATEGORY_COLORS[c].bg}`} />
              {BOT_CATEGORY_META[c].label}
            </li>
          ))}
        </ul>
        <ol className="divide-y rounded-lg border text-sm">
          {topBots.map((b) => (
            <li key={`${b.category}-${b.index}`} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="flex items-center gap-2 truncate">
                <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${CATEGORY_COLORS[b.category].bg}`} />
                {b.name}
              </span>
              <span className="tabular-nums text-muted-foreground">{fmt(b.visits)}</span>
            </li>
          ))}
        </ol>
      </div>
    </BrowserFrame>
  );
}
```

- [ ] **Step 3: Put the mockup in the hero**

In `HeroSection.tsx`, change the container (the inner `container` div of the hero section) so that the copy and the mockup sit side by side from `xl`, and the mockup sits under the copy below `xl`. The photo, gradient and copy stay as they are:

```tsx
        <div className="container mx-auto relative z-10 w-full px-4 pt-12 pb-12 xl:py-16 xl:grid xl:grid-cols-[34rem_minmax(0,1fr)] xl:items-center xl:gap-12">
          <div className="max-w-2xl xl:max-w-[34rem] text-center xl:text-left mx-auto xl:mx-0">
            {/* …existing badge, h1, stat, source, sub, CTAs, trust bullets unchanged… */}
          </div>
          <div className="mt-10 xl:mt-0 mx-auto w-full max-w-xl xl:max-w-none">
            <HeroDashboardMock />
          </div>
        </div>
```

Add `import { HeroDashboardMock } from "./HeroDashboardMock";`.

- [ ] **Step 4: Run the tests**

Run: `node --test tests/foundation/home-visuals.test.mjs tests/foundation/marketing-bot-claims.test.mjs`
Expected: PASS.

Run: `npx vite build >/dev/null && echo OK`
Expected: `OK` (no type errors that break the bundle).

- [ ] **Step 5: Commit**

```bash
git add src/components/home/HeroDashboardMock.tsx src/components/home/HeroSection.tsx
git commit -m "feat(home): dashboard mockup in the hero, photo kept as backdrop"
```

---

### Task 4: AI traffic cards with colour and sparklines

**Files:**
- Modify: `src/components/home/AiTrafficSection.tsx`

**Interfaces:**
- Consumes: `CATEGORY_COLORS`, `Sparkline`, `ExampleTag`, `examplesFor`, `HERO_DAYS`

- [ ] **Step 1: Confirm the label test guards this file**

Add `import { HERO_DAYS } from "@/data/homeSample";` to `AiTrafficSection.tsx` without using `ExampleTag` yet.
Run: `node --test tests/foundation/home-visuals.test.mjs`
Expected: FAIL with "AiTrafficSection.tsx uses sample data without the Example data label".

- [ ] **Step 2: Implement**

Replace `CATEGORY_STYLE` with icon + tag only (colour now comes from `CATEGORY_COLORS`):

```tsx
const CATEGORY_STYLE: Record<BotCategory, { icon: LucideIcon; tag: string }> = {
  training: { icon: Server, tag: "Infrastructure cost" },
  agentic: { icon: Zap, tag: "Real user intent" },
  citation: { icon: Globe, tag: "Visibility signal" },
};
```

Replace the card body inside `BOT_CATEGORIES.map` with:

```tsx
                <Card key={category} className={`border-t-4`} style={{ borderTopColor: CATEGORY_COLORS[category].hex }}>
                  <CardHeader>
                    <div className="flex items-center justify-between mb-2">
                      <Icon className={`h-6 w-6 ${CATEGORY_COLORS[category].text}`} aria-hidden="true" />
                      <Badge variant="secondary">{style.tag}</Badge>
                    </div>
                    <CardTitle className="text-xl">{BOT_CATEGORY_META[category].label}</CardTitle>
                    <CardDescription className="text-base">{BOT_CATEGORY_META[category].description}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-end justify-between gap-3">
                      <Sparkline
                        values={HERO_DAYS.map((d) => d[category])}
                        color={CATEGORY_COLORS[category].hex}
                        label={`Example trend for ${BOT_CATEGORY_META[category].label}`}
                      />
                      <ExampleTag />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">For example:</span> {examplesFor(category)}
                    </p>
                  </CardContent>
                </Card>
```

Add imports: `CATEGORY_COLORS` from `./categoryColors`, `Sparkline` from `./Sparkline`, `ExampleTag` from `./BrowserFrame`.

- [ ] **Step 3: Run the tests**

Run: `node --test tests/foundation/home-visuals.test.mjs tests/foundation/marketing-bot-claims.test.mjs`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/home/AiTrafficSection.tsx
git commit -m "feat(home): colour-coded AI traffic cards with example trends"
```

---

### Task 5: Real report previews for the free tools

**Files:**
- Modify: `src/components/home/ToolsSection.tsx`
- Test: `tests/foundation/home-visuals.test.mjs`

**Interfaces:**
- Consumes: `ReportView` (`src/components/tracking-check/ReportView.tsx`, props `summary, findings, mode, baselineUrl, targetUrl, finishedAt, collapsed`), `TRACKING_CHECK_SAMPLE` (`src/data/trackingCheckSample.ts`), `GtmAuditReport` (`{ report, sample }`), `GTM_AUDIT_SAMPLE` (`src/data/gtmAuditSample.ts`), `BrowserFrame`

- [ ] **Step 1: Write the failing test**

Append to `tests/foundation/home-visuals.test.mjs`:

```js
test('tool previews cannot be focused or read out (they are pictures of the tools)', () => {
  const src = read(HOME + 'ToolsSection.tsx');
  const previews = src.match(/<ToolPreview\b/g) ?? [];
  assert.equal(previews.length, 2, 'both tools use ToolPreview');
  assert.match(src, /inert: ""/);
  assert.match(src, /aria-hidden="true"/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/foundation/home-visuals.test.mjs`
Expected: FAIL with "both tools use ToolPreview".

- [ ] **Step 3: Implement**

Add to `ToolsSection.tsx`:

```tsx
import type { ReactNode } from "react";
import { ReportView } from "@/components/tracking-check/ReportView";
import { GtmAuditReport } from "@/components/gtm-audit/GtmAuditReport";
import { TRACKING_CHECK_SAMPLE } from "@/data/trackingCheckSample";
import { GTM_AUDIT_SAMPLE } from "@/data/gtmAuditSample";
import { BrowserFrame } from "./BrowserFrame";

/** The real report component at 60 % scale, cropped and faded. Not interactive: the tool page is one click away. */
function ToolPreview({ title, children }: { title: string; children: ReactNode }) {
  return (
    <BrowserFrame title={title}>
      {/* React 18 passes inert through only as a string attribute. */}
      <div className="relative h-72 overflow-hidden" aria-hidden="true" {...({ inert: "" } as Record<string, string>)}>
        <div className="w-[166.667%] origin-top-left scale-[0.6] p-4">{children}</div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-background to-transparent" />
      </div>
    </BrowserFrame>
  );
}
```

In each tool `Card`, put the preview first inside the card (above `CardHeader`), and shorten the Tracking Check description to its first sentence. The GTM description stays as it is (its "never uploaded" sentence is a reviewed statement):

```tsx
            <Card className="flex flex-col overflow-hidden">
              <div className="p-4 pb-0">
                <ToolPreview title="Tracking Check · example report">
                  <ReportView summary={TRACKING_CHECK_SAMPLE.summary} findings={TRACKING_CHECK_SAMPLE.findings} mode="policy"
                    baselineUrl={null} targetUrl={TRACKING_CHECK_SAMPLE.targetUrl} finishedAt={null} collapsed />
                </ToolPreview>
              </div>
              <CardHeader>
                <CardTitle>Tracking Check</CardTitle>
                <CardDescription className="text-base">
                  A real browser visits the site before and after the cookie banner is answered and records every request and cookie.
                </CardDescription>
              </CardHeader>
              {/* CardContent with "Free with a CortIQ account." and the button: unchanged */}
            </Card>
```

```tsx
            <Card className="flex flex-col overflow-hidden">
              <div className="p-4 pb-0">
                <ToolPreview title="GTM Audit · example container">
                  <GtmAuditReport report={GTM_AUDIT_SAMPLE} sample />
                </ToolPreview>
              </div>
              {/* CardHeader (without the FileSearch icon) and CardContent: unchanged */}
            </Card>
```

Remove the now-unused `ShieldCheck`/`FileSearch` icon imports if they are no longer used. The section container goes from `max-w-5xl` to `max-w-6xl`.

- [ ] **Step 4: Run the tests and a client build**

Run: `node --test tests/foundation/home-visuals.test.mjs tests/foundation/marketing-bot-claims.test.mjs && npx vite build >/dev/null && echo OK`
Expected: PASS, then `OK`.

- [ ] **Step 5: Commit**

```bash
git add src/components/home/ToolsSection.tsx tests/foundation/home-visuals.test.mjs
git commit -m "feat(home): real Tracking Check and GTM Audit reports as previews"
```

---

### Task 6: Banner demo page and local CSP server

**Files:**
- Create: `public/banner-demo/index.html`
- Create: `public/banner-demo/demo.js`
- Create: `tests/foundation/banner-demo.test.mjs`
- Create: `tests/foundation/csp-preview-server.mjs`

**Interfaces:**
- Produces: URL `/banner-demo/index.html?lang=<sv|en|de|fr|pt>`, used by Task 7.

- [ ] **Step 1: Write the failing tests**

`tests/foundation/banner-demo.test.mjs`:

```js
// public/banner-demo/: the real consent banner shown on the homepage inside <iframe sandbox="allow-scripts">.
// It must never log consent (no data-site-id), never be indexed, and survive the opaque origin
// where every storage access throws.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const html = read('public/banner-demo/index.html');
const demo = read('public/banner-demo/demo.js');

test('demo page is noindex, has no site id, no inline script and no inline handlers', () => {
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.doesNotMatch(html + demo, /data-site-id/);
  assert.doesNotMatch(html, /<script(?![^>]*\ssrc=)[^>]*>/, 'inline scripts need a CSP hash; use demo.js');
  assert.doesNotMatch(html, /<[a-z][^>]*\son[a-z]+\s*=/i);
  assert.doesNotMatch(read('src/marketing-routes.ts'), /banner-demo/);
});

function runDemo(search) {
  const appended = [];
  const documentElement = { lang: '' };
  const document = {
    documentElement,
    body: { appendChild: (el) => appended.push(el) },
    createElement: () => {
      const attrs = {};
      return { attrs, setAttribute: (k, v) => { attrs[k] = String(v); } };
    },
  };
  runInNewContext(demo, { document, location: { search } });
  assert.equal(appended.length, 1);
  return { script: appended[0], lang: documentElement.lang };
}

test('demo.js loads the real banner with a whitelisted language', () => {
  const { script, lang } = runDemo('?lang=de');
  assert.equal(script.src, '/consent-banner.js');
  assert.equal(script.attrs['data-lang'], 'de');
  assert.equal(script.attrs['data-company'], 'Example Company AB');
  assert.equal(lang, 'de');
  assert.equal('data-site-id' in script.attrs, false);
});

test('demo.js falls back to English for unknown or hostile values', () => {
  for (const search of ['', '?lang=xx', '?lang=%22%3E%3Cscript%3E', '?lang=sv-SE', '?foo=1&lang=EN']) {
    assert.equal(runDemo(search).script.attrs['data-lang'], 'en', search);
  }
});

test('the real banner renders and sends nothing when storage throws and no site id is set', () => {
  const source = read('public/consent-banner.js');
  const byId = new Map();
  const fetches = [];
  const timers = [];
  const el = (id) => {
    const listeners = {};
    return {
      id, style: {}, checked: false, innerHTML: '', textContent: '', parentNode: null,
      setAttribute(n, v) { this[n] = v; },
      addEventListener(n, fn) { (listeners[n] ||= []).push(fn); },
      click() { (listeners.click || []).forEach((fn) => fn()); },
      focus() {},
    };
  };
  const body = {
    appendChild(node) {
      byId.set(node.id, node);
      node.parentNode = { removeChild: () => byId.delete(node.id) };
      for (const m of node.innerHTML.matchAll(/<(button|input)[^>]*id="([^"]+)"[^>]*>/g)) byId.set(m[2], el(m[2]));
    },
  };
  const attrs = { 'data-lang': 'en', 'data-company': 'Example Company AB' };
  const blocked = () => { throw new Error('SecurityError: opaque origin'); };
  const context = {
    window: { dispatchEvent() {}, matchMedia: () => ({ matches: false }) },
    document: {
      currentScript: { getAttribute: (n) => (n in attrs ? attrs[n] : null) }, readyState: 'complete', body, cookie: '',
      documentElement: { lang: 'en' }, getElementById: (id) => byId.get(id) || null,
      createElement: () => el(''), querySelector: () => null, querySelectorAll: () => [],
    },
    navigator: { language: 'en-US' }, location: { hostname: 'cortiq.se' },
    Intl: { DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone: 'Europe/Stockholm' }) }) },
    CustomEvent: class { constructor(n, init) { this.detail = init.detail; } },
    crypto: { randomUUID: () => '00000000-0000-4000-8000-000000000001' },
    fetch: (...args) => { fetches.push(args); return Promise.resolve({ headers: { get: () => null }, json: () => ({}) }); },
    setTimeout: (fn) => timers.push(fn), Date, JSON, Math, String, Array, Promise,
  };
  Object.defineProperty(context, 'localStorage', { get: blocked });
  Object.defineProperty(context, 'sessionStorage', { get: blocked });
  runInNewContext(source, context);
  timers.splice(0).forEach((fn) => fn());
  assert.ok(byId.get('crtq-consent-banner'), 'banner shown');
  byId.get('crtq-cb-accept').click();
  timers.splice(0).forEach((fn) => fn());
  assert.equal(fetches.length, 0, 'no request leaves the demo');
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test tests/foundation/banner-demo.test.mjs`
Expected: FAIL with `ENOENT` for `public/banner-demo/index.html`.

- [ ] **Step 3: Implement the demo page**

`public/banner-demo/index.html`:

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Consent banner example</title>
<style>
  html, body { margin: 0; height: 100%; font-family: system-ui, sans-serif; background: #f7f9fc; color: #475569; }
  main { padding: 24px; font-size: 14px; }
  .line { height: 10px; border-radius: 5px; background: #e2e8f0; margin: 10px 0; }
</style>
</head>
<body>
<main>
  <p>Example page. Choices made here are not saved or sent.</p>
  <div class="line" style="width: 70%"></div>
  <div class="line" style="width: 90%"></div>
  <div class="line" style="width: 55%"></div>
</main>
<script src="demo.js"></script>
</body>
</html>
```

`public/banner-demo/demo.js`:

```js
// Loads the real consent banner for the homepage example. No data-site-id, so no consent is
// logged; the homepage frames this page with sandbox="allow-scripts", so nothing is stored either.
(function () {
  var LANGS = ['sv', 'en', 'de', 'fr', 'pt'];
  var match = /[?&]lang=([^&]*)/.exec(location.search);
  var lang = match && LANGS.indexOf(match[1]) !== -1 ? match[1] : 'en';
  document.documentElement.lang = lang;
  var script = document.createElement('script');
  script.src = '/consent-banner.js';
  script.setAttribute('data-lang', lang);
  script.setAttribute('data-company', 'Example Company AB');
  document.body.appendChild(script);
})();
```

- [ ] **Step 4: Run the tests**

Run: `node --test tests/foundation/banner-demo.test.mjs`
Expected: PASS (4 tests). If the last test fails because the banner touches storage outside a `try`, **stop and report**. Do not change `consent-banner.js` (SRI constraint); the fallback in Task 7 Step 4 applies instead.

- [ ] **Step 5: Add the local CSP server**

`tests/foundation/csp-preview-server.mjs`:

```js
// Serves dist/ with the Content-Security-Policy from dist/.htaccess, so CSP behaviour
// (e.g. scripts in sandboxed iframes) can be checked locally. Run after `npm run build`:
//   node tests/foundation/csp-preview-server.mjs   → http://127.0.0.1:8099/
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../../dist/', import.meta.url));
const csp = /Content-Security-Policy "([^"]+)"/.exec(readFileSync(join(dist, '.htaccess'), 'utf8'))?.[1]
  ?.replace(/;\s*report-(uri|to)[^;]*/g, '');
if (!csp) throw new Error('No Content-Security-Policy in dist/.htaccess');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.avif': 'image/avif', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain',
};

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://local').pathname);
  let file = normalize(join(dist, path));
  if (!file.startsWith(normalize(dist))) { res.writeHead(403).end(); return; }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) file = join(dist, 'index.html');
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Content-Security-Policy': csp });
  res.end(readFileSync(file));
}).listen(8099, '127.0.0.1', () => console.log('http://127.0.0.1:8099/'));
```

- [ ] **Step 6: Check the sandbox + CSP risk in a real browser before building on it**

Run: `npm run build >/dev/null && node tests/foundation/csp-preview-server.mjs` (in the background).

In Chrome, open `http://127.0.0.1:8099/` and run this in the DevTools console:

```js
const f = Object.assign(document.createElement('iframe'), { src: '/banner-demo/index.html?lang=sv', sandbox: 'allow-scripts', style: 'width:600px;height:460px' });
document.body.prepend(f);
```

Expected: the Swedish banner appears inside the iframe after about 1 s, with no CSP violation in the console (scripts allowed under `script-src 'self'`). Record the result (works / blocked) in the commit message. If blocked, Task 7 uses the fallback in its Step 4.

- [ ] **Step 7: Commit**

```bash
git add public/banner-demo tests/foundation/banner-demo.test.mjs tests/foundation/csp-preview-server.mjs
git commit -m "feat(home): static consent banner demo page + local CSP preview server

Sandboxed iframe check under the production CSP: <works|blocked>."
```

---

### Task 7: Consent, measurement modes and legal sections

**Files:**
- Modify: `src/components/home/ConsentSection.tsx` (rewrite)
- Create: `src/components/home/ModesSection.tsx`
- Create: `src/components/home/LegalSection.tsx`
- Modify: `src/pages/Index.tsx` (add the two sections after `ConsentSection`)
- Test: `tests/foundation/home-visuals.test.mjs`

**Interfaces:**
- Consumes: `/banner-demo/index.html?lang=` (Task 6), `BANNER_POINTS`, `MODES` (with `short`), `LEGAL_BASES`, `LEGAL_NOTES`, `LEGAL_DOCS` (Task 2), `Faq` from `src/components/tracking-check/LandingParts.tsx` (`{ items: { q: string; a: string }[] }`), `SectionHeader`
- Produces: `ModesSection()`, `LegalSection()`

- [ ] **Step 1: Write the failing test**

Append to `tests/foundation/home-visuals.test.mjs`:

```js
test('the banner example is the real banner in a sandbox without same-origin access', () => {
  const src = read(HOME + 'ConsentSection.tsx');
  assert.match(src, /src=\{`\/banner-demo\/index\.html\?lang=\$\{lang\}`\}/);
  assert.match(src, /sandbox="allow-scripts"/);
  assert.doesNotMatch(src, /allow-same-origin/);
});

test('reviewed legal text sits in details, measurement modes keep their full text', () => {
  assert.match(read(HOME + 'LegalSection.tsx'), /<Faq\b/);
  assert.match(read(HOME + 'ModesSection.tsx'), /<details\b[\s\S]*\{m\.text\}/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/foundation/home-visuals.test.mjs`
Expected: FAIL with `ENOENT` for `LegalSection.tsx` and a failed match in ConsentSection.

- [ ] **Step 3: Implement**

`src/components/home/ConsentSection.tsx`:

```tsx
import { useState } from "react";
import { EyeOff, Languages, Puzzle, RotateCcw, Scale, ScrollText, Settings2, type LucideIcon } from "lucide-react";
import { BANNER_POINTS } from "./copy";
import { SectionHeader } from "./SectionHeader";

const DEMO_LANGS = [
  { code: "en", label: "English" },
  { code: "sv", label: "Svenska" },
  { code: "de", label: "Deutsch" },
  { code: "fr", label: "Français" },
  { code: "pt", label: "Português" },
] as const;
type DemoLang = (typeof DEMO_LANGS)[number]["code"];

// One icon per BANNER_POINTS entry, same order.
const POINT_ICONS: LucideIcon[] = [Languages, Scale, ScrollText, EyeOff, Settings2, Puzzle];

export function ConsentSection() {
  const [lang, setLang] = useState<DemoLang>("en");
  const [run, setRun] = useState(0);

  return (
    <section className="py-20 px-4">
      <div className="container mx-auto max-w-6xl">
        <SectionHeader
          eyebrow="Consent and the law"
          title="Consent built in, in five languages"
          intro="Browser analytics waits for consent, unless you switch on aggregate mode. The banner, the consent log and the policy texts are part of the product, so the measurement and the legal side are set up together."
        />
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div>
            <div className="overflow-hidden rounded-xl border bg-background shadow-xl">
              <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-3 py-2">
                <div role="group" aria-label="Banner language" className="flex flex-wrap gap-1">
                  {DEMO_LANGS.map((l) => (
                    <button
                      key={l.code}
                      type="button"
                      lang={l.code}
                      aria-pressed={lang === l.code}
                      onClick={() => setLang(l.code)}
                      className={`rounded px-2 py-1 text-xs font-medium ${lang === l.code ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
                <button type="button" onClick={() => setRun((r) => r + 1)} className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  Show again
                </button>
              </div>
              <iframe
                key={`${lang}-${run}`}
                src={`/banner-demo/index.html?lang=${lang}`}
                title="Live example of the CortIQ consent banner"
                sandbox="allow-scripts"
                loading="lazy"
                className="block h-[520px] w-full sm:h-[460px]"
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">The real banner script. Choices made in this example are not saved or sent.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {BANNER_POINTS.map((p, i) => {
              const Icon = POINT_ICONS[i] ?? Scale;
              return (
                <div key={p.title} className="rounded-lg border p-4">
                  <div className="mb-1.5 flex items-center gap-2">
                    <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
                    <h3 className="font-semibold">{p.title}</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">{p.text}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
```

`src/components/home/ModesSection.tsx`:

```tsx
import { BarChart3, Shield, Users, type LucideIcon } from "lucide-react";
import { MODES } from "./copy";

const MODE_ICONS: LucideIcon[] = [Shield, Users, BarChart3];

export function ModesSection() {
  return (
    <section className="pb-20 px-4">
      <div className="container mx-auto max-w-6xl">
        <h3 className="mb-6 text-center text-xl font-bold">Three ways to measure visitors</h3>
        <div className="grid gap-6 md:grid-cols-3">
          {MODES.map((m, i) => {
            const Icon = MODE_ICONS[i] ?? Shield;
            return (
              <div key={m.title} className="rounded-xl border p-5">
                <Icon className="mb-3 h-6 w-6 text-primary" aria-hidden="true" />
                <h4 className="mb-1 font-semibold">{m.title}</h4>
                <p className="text-sm text-muted-foreground">{m.short}</p>
                <details className="group mt-3 text-sm">
                  <summary className="cursor-pointer font-medium text-primary">Details</summary>
                  <p className="mt-2 text-muted-foreground">{m.text}</p>
                </details>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
```

`src/components/home/LegalSection.tsx`:

```tsx
import { Link } from "react-router-dom";
import { FileText, Scale } from "lucide-react";
import { Faq } from "@/components/tracking-check/LandingParts";
import { LEGAL_BASES, LEGAL_DOCS, LEGAL_NOTES } from "./copy";

export function LegalSection() {
  return (
    <section className="pb-20 px-4">
      <div className="container mx-auto max-w-4xl">
        <div className="mb-4 flex items-center justify-center gap-2">
          <Scale className="h-5 w-5 text-primary" aria-hidden="true" />
          <h3 className="text-xl font-bold">How we read the rules</h3>
        </div>
        <Faq
          items={[
            ...LEGAL_BASES.map((b) => ({ q: b.title, a: b.text })),
            { q: "Install checklist and jurisdictions", a: LEGAL_NOTES.slice(0, 2).map((n) => `${n.lead} ${n.text}`).join(" ") },
          ]}
        />
        <p className="mt-4 text-center text-sm text-muted-foreground">{LEGAL_NOTES[2].text}</p>
        <div className="mt-3 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm">
          {LEGAL_DOCS.map((d) =>
            d.to ? (
              <Link key={d.label} to={d.to} className="inline-flex items-center text-primary hover:underline">
                <FileText className="mr-1.5 h-4 w-4" aria-hidden="true" />{d.label}
              </Link>
            ) : (
              <a key={d.label} href={d.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-primary hover:underline">
                <FileText className="mr-1.5 h-4 w-4" aria-hidden="true" />{d.label}
              </a>
            ),
          )}
        </div>
      </div>
    </section>
  );
}
```

(Deliberate deviation from the spec: the four legal document links stay visible under the `<details>` list, because links cost little text and help visitors and crawlers. Mention this in the PR.)

In `src/pages/Index.tsx`, import and render `<ModesSection />` and `<LegalSection />` directly after `<ConsentSection />`.

- [ ] **Step 4: Fallback (only if Task 6 Step 6 recorded "blocked")**

Change the iframe to `sandbox="allow-scripts allow-same-origin"` and, in the test, replace the `doesNotMatch(/allow-same-origin/)` assertion with:

```js
  // allow-same-origin fallback: the demo shares cortiq.se storage, so it must never be able to
  // overwrite a real choice. cortiq.se's own banner is the React SiteCookieBanner, keyed differently.
  const siteBanner = read('src/components/SiteCookieBanner.tsx');
  assert.doesNotMatch(siteBanner, /['"]site_cookie_consent['"]/);
```

First confirm that `src/components/SiteCookieBanner.tsx` is the banner cortiq.se renders, and check which key it uses (`grep -rn "localStorage" src/components/SiteCookieBanner.tsx`). If it uses `site_cookie_consent`, stop and report: the fallback is not safe and the design needs a decision.

- [ ] **Step 5: Run the tests**

Run: `node --test tests/foundation/home-visuals.test.mjs tests/foundation/banner-demo.test.mjs tests/foundation/marketing-bot-claims.test.mjs`
Expected: PASS (the "reviewed statements" test still passes, now with the text in `copy.ts`).

- [ ] **Step 6: Commit**

```bash
git add src/components/home/ConsentSection.tsx src/components/home/ModesSection.tsx src/components/home/LegalSection.tsx src/pages/Index.tsx tests/foundation/home-visuals.test.mjs
git commit -m "feat(home): live consent banner example, mode cards, legal text in details"
```

---

### Task 8: Attribution flow and operations status panel

**Files:**
- Modify: `src/components/home/AttributionSection.tsx`
- Modify: `src/components/home/OperationsSection.tsx`

**Interfaces:**
- Consumes: `BrowserFrame`, `ATTRIBUTION_FLOW`, `CONVERSION_BARS`, `STATUS_ROWS`, `PLATFORMS` (Task 1), `ATTRIBUTION`, `OPERATIONS` (Task 2)

- [ ] **Step 1: Implement the attribution visual**

In `AttributionSection.tsx`, between `SectionHeader` and the cards grid, add:

```tsx
          <BrowserFrame title="Lead quality pipeline" className="mb-8">
            <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-center">
              <ol className="flex flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                {ATTRIBUTION_FLOW.map((step, i) => (
                  <li key={step} className="flex flex-col items-center gap-2 sm:flex-row">
                    <span className="rounded-lg border bg-muted/30 px-3 py-2 text-center text-sm font-medium">{step}</span>
                    {i < ATTRIBUTION_FLOW.length - 1 && (
                      <>
                        <ArrowRight className="hidden h-4 w-4 text-muted-foreground sm:block" aria-hidden="true" />
                        <ArrowDown className="h-4 w-4 text-muted-foreground sm:hidden" aria-hidden="true" />
                      </>
                    )}
                  </li>
                ))}
              </ol>
              <dl className="space-y-2">
                {CONVERSION_BARS.map((b) => (
                  <div key={b.label}>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <dt>{b.label}</dt>
                      <dd className="tabular-nums">{b.value.toLocaleString("en-US")}</dd>
                    </div>
                    <div className="mt-1 h-2 rounded bg-muted">
                      <div className="h-2 rounded bg-primary" style={{ width: `${(b.value / CONVERSION_BARS[0].value) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </dl>
            </div>
          </BrowserFrame>
```

Imports: `ArrowDown`, `ArrowRight` from lucide-react; `BrowserFrame` from `./BrowserFrame`; `ATTRIBUTION_FLOW`, `CONVERSION_BARS` from `@/data/homeSample`. Make the four `ATTRIBUTION` cards compact: remove the `Target` icon, keep title + text, `CardTitle className="text-base"`.

- [ ] **Step 2: Implement the operations visual**

Replace the body of `OperationsSection.tsx` under `SectionHeader` with:

```tsx
          <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
            <BrowserFrame title="Site health">
              <ul className="divide-y">
                {STATUS_ROWS.map((r) => (
                  <li key={r.label} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                    <span className="flex items-center gap-2 font-medium">
                      <CheckCircle2 className="h-4 w-4 text-green-700" aria-hidden="true" />
                      {r.label}
                    </span>
                    <span className="text-muted-foreground">{r.value}</span>
                  </li>
                ))}
              </ul>
            </BrowserFrame>
            <div className="grid gap-4 sm:grid-cols-2">
              {OPERATIONS.map((o) => {
                const Icon = OPERATION_ICONS[o.id];
                return (
                  <div key={o.id} className="rounded-lg border p-4">
                    <Icon className="mb-2 h-5 w-5 text-primary" aria-hidden="true" />
                    <h3 className="mb-1 font-semibold">{o.title}</h3>
                    <p className="text-sm text-muted-foreground">{o.text}</p>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="mt-8 text-center">
            <p className="mb-3 text-sm font-medium text-muted-foreground">Works with</p>
            <ul className="flex flex-wrap justify-center gap-2">
              {PLATFORMS.map((p) => (
                <li key={p} className="rounded-full border px-3 py-1 text-sm">{p}</li>
              ))}
            </ul>
            <Link to="/integrations/" className="mt-6 inline-flex items-center text-primary font-medium hover:underline">
              See all integrations <ArrowRight className="ml-1 h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
```

Imports: `CheckCircle2`; `BrowserFrame`; `STATUS_ROWS`, `PLATFORMS` from `@/data/homeSample`.

- [ ] **Step 3: Run the tests and a client build**

Run: `node --test tests/foundation/home-visuals.test.mjs tests/foundation/marketing-bot-claims.test.mjs && npx vite build >/dev/null && echo OK`
Expected: PASS, then `OK`.

- [ ] **Step 4: Commit**

```bash
git add src/components/home/AttributionSection.tsx src/components/home/OperationsSection.tsx
git commit -m "feat(home): attribution flow and site health panel"
```

---

### Task 9: Full verification and PR

**Files:** none new (fixes only, if checks find issues).

- [ ] **Step 1: All tests and the production build**

Run: `npm run test:foundation 2>&1 | tail -5 && npm run build 2>&1 | tail -5`
Expected: `fail 0`, and the build finishes, including `pin-tracker` (no version-bump error, because the tracker files are untouched) and `csp-hashes`.

Run: `git diff main --stat -- public/consent-banner.js public/cortiq.js src/lib/sri-manifest.json public/v`
Expected: empty.

- [ ] **Step 2: Text reduction**

Run: `node "$TMP/home-text.cjs" dist/index.html --visible; cat "$TMP/home-before-words.txt"`
Expected: visible words after ≤ about 65 % of before (spec: ~40 % less). Report both numbers in the PR. If the reduction is well short of the target, list the longest visible blocks in the PR instead of cutting reviewed text.

- [ ] **Step 3: Browser check under the production CSP**

Run `node tests/foundation/csp-preview-server.mjs` in the background and check `http://127.0.0.1:8099/` (trailing slash) in Chrome at 1440 px and 390 px wide:
- Console: no React #418/#423 and no CSP violations.
- Hero: the mockup sits to the right of the copy at 1440 and under it at 390, and the photo still shows behind it at 1440.
- Banner: it renders in all five languages, "Show again" brings it back after a choice, and at 390 px its buttons are inside the iframe (if not, raise the mobile `h-[520px]`).
- Tab through the page: focus never enters the two tool previews.
- No horizontal scroll at 390 px; the attribution flow stacks vertically.
- DevTools → Lighthouse (mobile) on `/`: note the LCP and compare it with the same run on `main` (`git stash; npm run build`, or the live cortiq.se). LCP must not be worse.

- [ ] **Step 4: Push and open the PR**

```bash
git push -u origin feat/visual-homepage
gh pr create --title "feat(home): visual homepage" --body "$(cat <<'EOF'
Implements docs/superpowers/specs/2026-11-19-visual-homepage-design.md.

- Hero: dashboard mockup over the kept photo
- AI traffic: colour-coded cards with example trends
- Free tools: real Tracking Check / GTM Audit reports as non-interactive previews
- Consent: the real consent-banner.js in a sandboxed iframe (/banner-demo/, noindex, no site id)
- Modes and legal: reviewed text unchanged, moved into <details>; legal doc links stay visible (deviation from spec)
- Attribution flow and site-health panel
- Visible words: <before> → <after>; LCP: <main> → <branch>

Tests: home-visuals, banner-demo (incl. opaque-origin VM run), bot claims now cover src/components/home.
consent-banner.js / cortiq.js / SRI manifest untouched.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Fill in the numbers from Steps 2–3 before running. Deploy afterwards: dist via FTP (by the user). There are no Edge Function or DB changes.
