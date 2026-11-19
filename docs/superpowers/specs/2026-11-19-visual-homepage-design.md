# Visual homepage — design

Date: 2026-11-19 · Status: approved (option C), spec awaiting review · Baseline: `src/pages/Index.tsx` on main 69d811c (448 lines, live)

## Problem

The homepage explains CortIQ mostly in text. There are no product visuals: the hero is a stock photo
(`src/assets/hero/`), and the tool, consent, attribution and operations sections are text cards. An external review
(2026-11-19) asked for three things: show the product earlier, cut the text by 40–50 %, and use one consistent
visual system. It also named the three visuals with the most impact: the AI traffic categories, a real dashboard
and Tracking Check.

## Goal

A first-time visitor understands what CortIQ does from the visuals alone in the first two screens. Every public
claim on the page today stays on the page.

## Non-goals

- No new product claims, statistics or customer numbers.
- No changes to `consent-banner.js`, `cortiq.js` or the SRI manifest.
- No changes to other marketing pages, nav or footer.
- No brand logos for third-party platforms, and no AI-generated robot or network imagery.

## Decisions

| Decision | Choice |
|---|---|
| Product visuals | **C (mixed):** coded mockups for the dashboard, categories and flows, and the real report components with their existing synthetic sample data for the tools |
| Hero photo | Kept as the background, with the dashboard mockup on top so the product dominates |
| Chart technique | Static SVG + Tailwind. No Recharts, because it measures its size in the browser and breaks SSG prerender |
| Data labelling | Every mockup carries a small "Example data" label. No realistic-looking customer statistics |
| Bot names | Only from the registry via `src/lib/aiBotRegistry.ts` |
| Platforms | Text labels (WordPress, Next.js, Netlify, Cloudflare, Node, GTM), no logos |
| Legal text | The jurist-reviewed copy is kept word for word and moved into `<details>` |
| Consent banner | The real `/consent-banner.js` rendered in a sandboxed iframe, not a picture |

## Visual system

- **Icons:** lucide-react only, one stroke weight.
- **Cards:** thin border, generous padding, equal card height within a section.
- **Category colours:** training, agentic and citation each get one colour token, defined once (for example
  `src/components/home/categoryColors.ts`, keyed by the registry's `BOT_CATEGORIES`) and used everywhere on the page.
  The colours must keep WCAG AA contrast against the light theme (the public site is light-only:
  `defaultTheme="light"`, `enableSystem={false}`).
- **Mockup frame:** a shared `BrowserFrame` component (window dots, optional URL bar, the "Example data" label in a corner).

## Sections (top to bottom)

| # | Section | Visual content |
|---|---|---|
| 1 | **Hero** | Copy and CTAs on the left as today (badge, h1, TollBit stat with its source, CTAs, trust bullets). Right: `HeroDashboardMock` in a `BrowserFrame` over the photo, showing a KPI row (AI visits, human visits, AI share), daily stacked bars coloured by category, and a top-bots list from the registry. On mobile the mockup goes under the copy. The photo stays in its `<picture>` as the background, including `hero-mobile-900`. |
| 2 | **AI traffic** | Three cards (training, agentic, citation) with an icon, a small static sparkline in the category colour, example bots from `botsInCategory()`, and one line on what the traffic means. The Cloudflare stat line and the /features/ai/ link stay. |
| 3 | **Free tools** | Two large cards with the real `ReportView` (`TRACKING_CHECK_SAMPLE`) and `GtmAuditReport` (`GTM_AUDIT_SAMPLE`), scaled down and cropped (fixed height, fade at the bottom, `inert` + `aria-hidden` so it is not interactive), each with a button to the tool. |
| 4 | **Consent** | Left: the banner demo iframe (see below) with a language switcher (sv/en/de/fr/pt) and a "Show again" button. Right: six small icon cards for languages, consent log, GPC, Consent Mode v2, Cookiebot/CMP and re-asking after 12/6 months. |
| 5 | **Measurement modes** | Cookieless, Full and Aggregate as three comparison cards with an icon and 1–2 lines each. |
| 6 | **Legal** | "How we read the rules" and the legal doc links inside `<details>`, reusing the `Faq` pattern from `src/components/tracking-check/LandingParts.tsx`. Text unchanged. |
| 7 | **Ads and attribution** | A flow chain: ad click → visit → form → HubSpot → qualified lead → Google Ads, with a small conversion chart beside it. Footnote: only visits with marketing consent. |
| 8 | **Operations and API** | A status panel (uptime OK, snippet found, SRI version pinned), a grid of platform text labels, and a separate card for the REST API and MCP. Link to /integrations/ stays. |
| 9 | **Closing CTA** | Unchanged. |

Text volume drops by about 40 %. Details move into `<details>` blocks or onto the existing linked pages, and no
claim is removed. The copy rules in CLAUDE.md still apply ("designed to not require consent", "sessionStorage after
consent", and so on).

## Consent banner demo

- **New static page** `public/banner-demo/index.html` + `demo.js`. `demo.js` reads `?lang=` (whitelist
  sv/en/de/fr/pt, default en) and injects `<script src="/consent-banner.js" data-lang="…" data-company="Example Company AB">`.
- **No data sent:** there is no `data-site-id`. Without it the banner sends nothing to the server (checked in
  `consent-banner.js` 2026-11-19).
- **Nothing stored on cortiq.se:** the iframe uses `sandbox="allow-scripts"` (opaque origin), so the banner cannot
  write to cortiq.se's localStorage.
- **"Show again"** reloads the iframe with the current `lang`.
- **CSP:** `frame-src 'self' https:` already allows the iframe. `demo.js` is an external same-origin file, so it
  needs no inline hash. **Risk:** under an opaque origin, `script-src 'self'` may not match and Chrome may block the
  scripts. Test this first in a real browser. Fallback: `sandbox="allow-scripts allow-same-origin"`, plus a check
  that the site's own banner (if any) uses a different localStorage key, so the demo cannot change a real visitor's
  stored choice.
- **No indexing:** `<meta name="robots" content="noindex">`. Not in `src/marketing-routes.ts` or the sitemap.
- **SRI:** `consent-banner.js` is unchanged, so there is no version bump. The demo always shows the current build.

## Code structure

- `src/pages/Index.tsx` becomes a thin composition of sections.
- `src/components/home/` holds one file per section (`HeroSection.tsx`, `AiTrafficSection.tsx`,
  `ToolsSection.tsx`, `ConsentSection.tsx`, `ModesSection.tsx`, `LegalSection.tsx`, `AttributionSection.tsx`,
  `OperationsSection.tsx`, `ClosingCta.tsx`) plus shared `BrowserFrame.tsx`, `SectionHeader.tsx` and
  `categoryColors.ts`.
- `src/data/homeSample.ts` holds all mockup numbers in one place, round and visibly illustrative.
- The inline copy constants (`BANNER_POINTS`, `MODES`, `LEGAL_BASES`, `LEGAL_DOCS`, `ATTRIBUTION`, `OPERATIONS`)
  move with their sections.
- SEO (`useSEO`, `seoFor("/")`) and prerender behaviour stay the same.

## Tests

- **Bot claims:** extend `tests/foundation/marketing-bot-claims.test.mjs` to scan `src/components/home/` and
  `src/data/homeSample.ts` (it scans `src/pages` and `src/content` today).
- **Example label:** every component that renders a mockup uses `BrowserFrame`, and `BrowserFrame` renders "Example data".
- **Banner demo:** the files under `public/banner-demo/` contain no `data-site-id`, the page has `noindex`, and the
  route is absent from `marketing-routes.ts`.
- **Existing suites:** SRI manifest, CSP hashes and the hydration/SSG tests stay green.

## Verification before PR

- `npm test`, `npm run build` (incl. `pin-tracker` and `csp-hashes`).
- Browser check on desktop and mobile at `/` (trailing slash; see the SSG hydration memory): no React #418/#423,
  no CSP violations in the console, the banner renders in the iframe in all five languages, and "Show again" works.
- Lighthouse: LCP no worse than today (the hero image stays the LCP element; mockups are SVG/HTML with no images).

## Open questions

None. The decisions above were approved in chat on 2026-11-19.
