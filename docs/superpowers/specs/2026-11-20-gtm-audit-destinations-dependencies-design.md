# GTM audit: destinations, dependencies and fragile DOM triggers

Date: 2026-11-20. Status: approved by Daniel 2026-11-20 (decisions below).
Builds on: `2026-11-17-gtm-container-audit-design.md` (phase 1, live at `/gtm-audit/`).

## Why

A LinkedIn thread (2026-11-20) about leaving GA4 described the same three problems that keep a tag cleanup from
moving:

1. **Where does the data go?** Inherited containers often hold two or three Meta pixels and old conversion tags
   from agencies that left years ago. Each one sends visitor data to an account the site owner may not control.
2. **What breaks if I remove this?** "The problem isn't the tag nobody uses. It's the layers of data dependencies
   underneath it that break when you remove the tag nobody remembers the purpose of."
3. **What is fragile?** Undocumented DOM scrapers and CSS-selector triggers stop working after a redesign. Nobody
   notices, because nothing reports an error.

All three can be answered from the container export alone. The page keeps its phase 1 promise: the file is parsed
in the browser and never sent anywhere.

## Scope

In scope:
- **A.** Destination IDs per tag, and a rule for vendors with more than one destination ID.
- **B.** A dependency graph inside the container, a rule for it, and a guard on the `remove` migration class.
- **C.** A rule for fragile DOM-based triggers and variables.
- New columns in the tag table and in the spreadsheet export. Three new check keys in the stats whitelist (counts
  only).

Out of scope:
- **Live verification** (phase 2 of the parent spec).
- **Account ownership.** The audit cannot know who owns an ID. It shows the IDs and asks.
- **GTM user access.** The export has no permissions, and the GTM API needs OAuth.
- **Dependencies outside the container:** site code reading `dataLayer`, `gtag()` calls in page templates, a second
  container, server-side GTM.
- **Generating a dataLayer schema.**

## Evidence and copy

- Every new finding carries `EVIDENCE_LEVEL` (configuration, not observed live), as today.
- Dependencies are labelled `certain` (stated in the configuration: tag sequencing, an event name pushed in one
  tag's HTML and matched exactly by a trigger) or `possible` (a text match: a global or cookie name, a regex or
  `contains` event match).
- The UI says once, above the dependency column: "Only dependencies inside this container are shown. Code on the
  site or in another container can also rely on a tag."
- The audit never says an ID belongs to an agency or a former supplier. Wording: "Check who owns each account. An ID
  nobody recognises often belongs to an old account or a former agency, and data sent to it is outside your control."
- Destination IDs appear in the on-page report and the local spreadsheet export only. They never enter
  `buildStats`, the edge function or any test fixture taken from a real container. The existing rule (synthetic
  containers only) applies.

## A. Destinations

### Engine
New `_shared/gtm-audit/destinations.ts`:

```ts
export interface Destination {
  vendorId: string;          // registry id, e.g. 'meta-pixel', 'ga4', 'google-ads'
  id: string | null;         // normalized destination ID; null when unresolved
  raw: string;               // the value as written, e.g. '{{Meta ID}}'
  resolved: 'literal' | 'constant_variable' | 'lookup' | 'unresolved';
}
export function destinationsOf(info: TagInfo, container: Container): Destination[];
```

Sources, in order:
1. **Built-in and template params:** the existing `ID_KEYS` in `rules/hygiene.ts`, moved to `destinations.ts` and
   shared by both. `pixelIds` can hold several IDs.
2. **Custom HTML:** fixed patterns per vendor, applied to the `html` param as text:
   - Meta: `fbq('init', '<digits>')`.
   - Google: `gtag('config', 'G-…' | 'AW-…' | 'DC-…')` and `?id=` on `googletagmanager.com/gtag/js`.
   - LinkedIn: `_linkedin_partner_id = "<digits>"`.
   - TikTok: `ttq.load('<id>')`.
   - Microsoft UET: `ti: "<digits>"`.
   - Pinterest: `pintrk('load', '<digits>')`.
   - Snap: `snaptr('init', '<uuid>')`.
   - Hotjar: `hjid: <digits>`.
   - Clarity: `clarity", "<id>"`.

   Every regex must be linear: no nested quantifiers, bounded classes. Each one gets a timing test on a 5 MB input,
   as `templateIdOf` has.
3. **Variable references:**
   - `{{Name}}` that resolves to a Constant variable → its value, `constant_variable`.
   - A Lookup Table or RegEx Table → every output value, `lookup`.
   - Anything else → `unresolved`.

**Normalization:** trim; upper-case the `G-`, `AW-`, `DC-`, `UA-` prefixes; drop the conversion label after `/` for
`AW-` (the account is the destination).

### Rule `gtm.multiple_destinations`
- **Condition:** among active tags (`isActive`), one vendor has two or more distinct resolved IDs.
- **Status / priority / typicalOwner:** manual / high / marketing.
- **Title:** `${n} vendors send data to more than one account`.
- **Details:** one line per vendor:
  `Meta Pixel: 2 IDs — 1234567890 (3 tags, last changed 2025-03-02), 9876543210 (1 tag, last changed 2021-06-10)`.
  Last changed is the newest `modifiedAt` among that ID's tags.
- **Explanation:** "Each ID is a separate account at the vendor. Check who owns each one. An ID nobody recognises
  often belongs to an old account or a former agency, and data sent to it is outside your control."
- **Fix:** "Keep the IDs your organisation owns and has access to. Remove or pause tags that send to the others."
- **Not a finding:**
  - GA4 and Google Ads together (different vendors).
  - Several `AW-` conversion labels on one account.
  - Unresolved IDs. These are listed once at the end of the details as "n tags with an ID the audit could not
    resolve".
- **Exception:** a `UA-` ID next to a `G-` ID is not reported as a second GA4 account. UA is already `remove`
  (no longer processes data).

### Tag table
New column **Sends to**: the destination IDs, or "Unresolved ({{Name}})". It is also added to the spreadsheet.

## B. Dependencies

### Engine
New `_shared/gtm-audit/dependencies.ts`:

```ts
export type DepKind = 'sequence' | 'event' | 'consent_tool' | 'global' | 'cookie';
export interface Dependency { from: string; to: string; kind: DepKind; via: string; confidence: 'certain' | 'possible' }
// from = the tag that is relied on; to = the tag that relies on it; ids are GTM tag ids.
export function dependencies(container: Container, infos: TagInfo[]): Dependency[];
```

The parser keeps three fields it drops today:
- `setupTag[].tagName`
- `teardownTag[].tagName`
- the trigger's `customEventFilter`, the custom-event condition (`{{_event}}`)

`GtmTag` gains `setupTagNames: string[]` and `teardownTagNames: string[]`. `GtmTrigger` gains `customEvent:
{ match: 'equals' | 'contains' | 'starts_with' | 'regex'; value: string } | null`.

Edges, all among active tags:

| kind | From → to | Confidence |
|---|---|---|
| `sequence` | A tag named in B's setup or teardown → B | certain |
| `event` | A tag whose HTML contains `dataLayer.push(` with `event: '<name>'` (single, double or no quotes on the key) → every tag with a firing trigger whose `customEvent` matches `<name>` | certain for `equals`; possible for other matches |
| `consent_tool` | Every tag with migration class `consent_tool` → every tag with consent status `gated` | certain |
| `global` | A tag whose HTML assigns `window.<x>` or a top-level `var <x>` → tags that use a JavaScript Variable (`j`) named `<x>`, directly or through a trigger condition | possible |
| `cookie` | A tag whose HTML sets `document.cookie` with `<name>=` → tags that use a 1st-party cookie variable (`k`) for `<name>` | possible |

- **Regex triggers:** user regexes from the container run through `new RegExp` in a try. A pattern that fails to
  compile is skipped. A pattern longer than 200 characters is skipped as `possible`, so a hostile regex in an
  uploaded file cannot hang the page.
- **Variables used through other variables:** the audit follows variable-in-variable references
  (`{{A}}` inside variable B), at most 5 levels deep, so a tag that uses B also depends on what A reads.

### Rule `gtm.dependencies`
- **Condition:** at least one `certain` or `possible` dependency.
- **Status / priority / typicalOwner:** manual / medium / gtm.
- **Title:** `${n} tags that other tags rely on`.
- **Details:** one line per relied-on tag, for example:
  `Form success push (Custom HTML) → Lead conversion (Google Ads), Lead (Meta Pixel) — event 'form_ok' (certain)`.
- **Explanation:** "Removing or changing these tags also stops the tags that rely on them. Only dependencies inside
  this container are shown."
- **Fix:** "Remove a tag together with the tags that rely on it, or move what it provides (the event, value or
  cookie) to the site before removing it."

### Guard on migration classes
In `migrate.ts`: when a tag's class would be `remove` and it has at least one `certain` dependent that is not itself
`remove`, the class becomes `review`. The reason is "Other tags rely on it: <names>. Remove together or rewire
first." UA tags are excluded: UA still becomes `remove`, because nothing it sends is processed.

### Tag table
New column **Relied on by**: the count, with the names on hover/expand, plus "certain" or "possible". It is also
added to the spreadsheet as names.

## C. Fragile DOM triggers and variables

### Engine
New `_shared/gtm-audit/fragile.ts`. A source is fragile when it depends on page markup rather than on a named event:
- A trigger condition using the CSS selector matcher (`cssSelector`).
- A trigger condition on `Click Classes`, `Click ID`, `Click Text`, `Form Classes`, `Form ID` or `Form Text`.
- An Element Visibility trigger with a selector.
- A DOM Element variable (`d`).
- A Custom JavaScript variable (`jsm`) whose code reads the page: `document.querySelector`, `querySelectorAll`,
  `getElementById`, `getElementsBy`, `innerText`, `textContent`, `$(` or `jQuery(`.

Each active tag that uses a fragile source is recorded together with that source. A tag counts as using it through
its firing triggers, including trigger groups, or through a `{{var}}` in its params, followed through variables
as in B.

### Rule `gtm.fragile_dom`
- **Condition:** at least one active tag uses a fragile source.
- **Status / priority / typicalOwner:** manual. Priority is **medium** when any of these tags has migration class
  `conversion` or `pixel`, otherwise **low**. typicalOwner: developer.
- **Title:** `${n} tags rely on page markup`.
- **Details:** one line per tag, for example:
  `Lead conversion (Google Ads): click trigger "CTA click" matches CSS selector ".btn-primary"`.
- **Explanation:** "These tags fire on page markup (a CSS class, element ID or button text). A redesign or a text
  change can stop them without any error, and the tag silently stops counting."
- **Fix:** "Have the site push a named event when the action happens (for example `dataLayer.push({event:
  'generate_lead'})`) and trigger on that event instead."

## Shared changes

- **`CHECK_KEYS`:** add `gtm.multiple_destinations`, `gtm.dependencies` and `gtm.fragile_dom`. `validateStats`
  accepts them through `CHECK_KEYS` as today. No new stats map, and no IDs, names or event names.
- **`ENGINE_VERSION`:** goes to 2. Stats rows carry it, so counts from before and after stay apart.
- **Sample report:** regenerate with `node scripts/gtm-audit/sample-report.mjs`. The synthetic sample container
  gains:
  - a second Meta pixel ID on an old tag;
  - a Custom HTML `dataLayer.push` event consumed by a conversion tag;
  - a CSS-selector click trigger on a conversion.

  The freshness test keeps it current.
- **Rule order in the report:** destinations right after the consent rules, then dependencies, then the hygiene
  rules, with fragile DOM after duplicate.
- **Public page copy** (`GtmAudit.tsx` and the landing text): add one line per new check, in the existing style.
  Copy rules unchanged: configuration only, never "fires", none of the banned phrases.

## Tests (synthetic containers only)

- **destinations:**
  - literal, constant, lookup and unresolved IDs;
  - the Custom HTML pattern for each vendor;
  - an `AW-` label stripped;
  - a UA + G pair not reported;
  - two Meta IDs reported, with the newest `modifiedAt` per ID;
  - a timing test for every regex on 5 MB.
- **dependencies:**
  - a sequence edge;
  - `equals` (certain) and regex (possible) event edges;
  - a hostile and an uncompilable trigger regex are skipped;
  - consent_tool edges;
  - global and cookie edges marked possible;
  - a variable chain capped at 5 levels;
  - a `remove` tag with a certain dependent becomes `review`, while UA stays `remove`.
- **fragile:**
  - each fragile source type;
  - a tag reached through a trigger group;
  - medium priority on a conversion and low priority otherwise.
- **stats:** the three keys are counted, and `validateStats` rejects an unknown key and any string value.
- **page:** the existing no-network test still passes, and the tag table renders both new columns.
- **sheets:** both new columns are present, and evidence truncation still applies.

## Acceptance

1. On the sample container, the report shows all three new findings with the expected detail lines.
2. A container with no matching patterns gets the three new checks as `pass`, with no new noise.
3. The page makes no network call carrying container content (the existing test).
4. Stats from engine v2 contain only the whitelisted keys and counts.
5. `npm run test:foundation`, `tsc` (baseline unchanged) and `vite build` pass.

## Decisions 2026-11-20 (Daniel)

| Question | Decision |
|---|---|
| `remove` → `review` guard | A `certain` dependent downgrades `remove` to `review`; UA stays `remove`. |
| Destination IDs on screen | Shown in full. They are in the user's own file and on their public pages. |
| Fragile DOM in this round | Yes, built together with A and B. |
