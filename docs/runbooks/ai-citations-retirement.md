# Runbook: retiring ai_citations (tracker 5.5.23)

Rollout and data cleanup are separate. Step A changes code and data sources only and deletes nothing.
Step B (cleanup) and step C (drop the table) run only after step A has been verified in production, each with Daniel's go.

## Background

`trackAICitation()` in the tracker sent every visitor arriving from an AI service to `ai-bot-tracker` with
`citationData`. The function stored the human visitor as an "Unknown Bot" in `ai_bot_traffic` (`request_type = 'citation'`,
`bot_category = 'other'`) and as a row in `ai_citations`. The AI bots tab showed `ai_citations` as "Citation Requests"
and the KPI catalog called it "AI Citations". Neither was a citation.

The same visit was already measured by `trackAISearch()` → `ai-search-tracker` → `ai_search_traffic`, behind the same
analytics-consent gate and the same `detectAIReferrer()`. Dropping the citation path loses no real coverage.

## Data inventory (production, read-only, 2026-11-21)

| Source | Rows | Notes |
|---|---|---|
| `ai_citations` | 66 (2026-04-09 – 2026-11-05), 3 in the last 30 days | All linked to `ai_bot_traffic` "Unknown Bot" rows. Mostly internal-page referrers on expandtalk.se / ekonom.biz from old keyword-matching trackers; about 2 real chatgpt.com referrals. UTM columns always empty. |
| `ai_search_traffic` | 2 (2026-09-21, 2026-11-03) | The same 2 real AI referrals as in `ai_citations` since September. |
| `tracking_sessions` with AI referrer/UTM | 12 ever, 3 sites, 1 in the last 30 days | Consent-gated, like `ai_search_traffic`. |
| `ai_bot_traffic`, `request_type = 'citation'` | 10,461 | See split below. |

`ai_bot_traffic` with `request_type = 'citation'`:

| Stored category | Rows | What it is | Action |
|---|---|---|---|
| `citation` | 5,633 (FacebookBot 3060, Amazonbot 1114, Bingbot 423, PerplexityBot 385, Applebot 312, Googlebot 181, OAI-SearchBot 144, GoogleOther 11, DuckAssistBot 2, YouBot 1) | Real citation crawlers | **Never touch** |
| `other`, bot_name "Other Bot" | 4,761 (AhrefsBot 3619, Baiduspider-render 1061, ExaSearchBot, SeekportBot, …), 2026-09-20 – 10-14 | Pre-registry misclassification | Reclassify to `request_type = 'unknown'` |
| `other`, bot_name "Bingbot" | 1 | Pre-registry misclassification | Reclassify to `request_type = 'unknown'` |
| `other`, bot_name "Unknown Bot" | 66 | Human AI-referral visits from `trackAICitation()` | Archive, then delete |

Readers of `ai_citations` before this change: `get_ai_bot_tracking(uuid, integer)` (legacy overload, not called by the
frontend) and `get_ai_bot_tracking(uuid, date, date, text)` (`citationRequests`, `citationCtr`). No views, triggers or
exports. `ai-assistant` and `mcp-server` already read `ai_search_traffic`.

## Step A: rollout (this PR)

1. `supabase db push --remote --yes` for `20261212000001_ai_bot_citation_crawlers.sql`.
   - Drops the `(uuid, integer)` overload.
   - `citationRequests` = `ai_bot_traffic` rows with `request_type = 'citation' AND bot_category = 'citation'`.
   - `citationCtr` removed.
   - Comments `ai_citations` as retired.

   Safe before the function deploy: the old function still writes `ai_citations`, nothing reads it, and the old
   dashboard falls back to 0 for the missing `citationCtr`.
2. `supabase functions deploy ai-bot-tracker`. From here, `citationData` from cached or pinned trackers (≤ 5.5.22) is
   acknowledged with `skipped: 'no_bot_evidence'` and never written. Those trackers still send the same visit to
   `ai-search-tracker`, so it is still measured.
3. `npm run build` (shared version 5.5.23, new pinned `public/v/5.5.23/`, `src/lib/sri-manifest.json`), dist FTP,
   then publish WP plugin 5.5.23. **Keep every older `public/v/` directory on the server**: sites pinned to 5.5.22 or
   earlier keep loading their exact file. No `securityFix` flag: older pins keep working, their extra citation request
   is dropped server-side.

### Verify step A (before step B)

```sql
-- No new ai_citations rows after the function deploy.
select max(created_at) from ai_citations;
-- No new human "Unknown Bot" citation rows after the function deploy.
select count(*) from ai_bot_traffic
 where request_type = 'citation' and bot_category <> 'citation' and detected_at > '<deploy time>';
-- AI-referred visits keep arriving where expected.
select site_id, ai_platform, count(*) from ai_search_traffic where created_at > '<deploy time>' group by 1, 2;
```

In the dashboard: AI bots tab → "Citation Crawler Requests" equals the citation crawlers in the bot breakdown; the
AI traffic tab shows "Measured AI-referred visits"; the KPI catalog shows "Citation Crawler Requests".

## Step B: cleanup (separate, after step A is verified)

Not a migration. Run in one transaction in the SQL editor, read the counts, and commit only if they match the inventory.
Deleting from `ai_bot_traffic` cascades to `ai_citations` and `ai_bot_probe_signals` (FK `ON DELETE CASCADE`), so both
are archived first.

```sql
begin;

create table public.ai_citations_archive_20261212 as table public.ai_citations;
create table public.ai_bot_traffic_citation_archive_20261212 as
  select * from public.ai_bot_traffic
   where request_type = 'citation' and bot_category is distinct from 'citation';
create table public.ai_bot_probe_signals_citation_archive_20261212 as
  select p.* from public.ai_bot_probe_signals p
    join public.ai_bot_traffic_citation_archive_20261212 a on a.id = p.traffic_id;
alter table public.ai_citations_archive_20261212 enable row level security;
alter table public.ai_bot_traffic_citation_archive_20261212 enable row level security;
alter table public.ai_bot_probe_signals_citation_archive_20261212 enable row level security;
revoke all on public.ai_citations_archive_20261212, public.ai_bot_traffic_citation_archive_20261212,
  public.ai_bot_probe_signals_citation_archive_20261212 from anon, authenticated;

-- Expect 66 / 4828 (± rows added before the function deploy).
select count(*) from public.ai_citations_archive_20261212;
select bot_name, count(*) from public.ai_bot_traffic_citation_archive_20261212 group by 1 order by 2 desc;

-- Human visits: not bots.
delete from public.ai_bot_traffic
 where request_type = 'citation' and bot_category = 'other' and bot_name = 'Unknown Bot';
-- Pre-registry crawlers: keep the row, drop the wrong label (what ai-bot-tracker writes today for them).
update public.ai_bot_traffic set request_type = 'unknown'
 where request_type = 'citation' and bot_category = 'other';

-- Must be 0: only registry citation crawlers keep request_type 'citation'.
select count(*) from public.ai_bot_traffic where request_type = 'citation' and bot_category is distinct from 'citation';
-- Must equal the 'citation' row of the inventory: untouched.
select count(*) from public.ai_bot_traffic where request_type = 'citation' and bot_category = 'citation';

commit;  -- or rollback
```

Rollback of step B: re-insert from the archive tables (`insert into ai_bot_traffic select * from …_archive_20261212
on conflict (id) do update set request_type = excluded.request_type`, then `ai_citations` and `ai_bot_probe_signals`
from their archives).

## Status

- Step A verified 2026-11-22 (deploy 2026-11-21 16:30 UTC): no new `ai_citations` or human citation rows,
  `ai_search_traffic` still receiving.
- Step B run 2026-11-22 as one guarded block: 66 archived + deleted, 4,762 reclassified, 4,761 probe signals archived,
  6,792 citation crawler rows untouched.
- Step C: `20261213000001_drop_ai_citations.sql`.
- Drop the three `*_archive_20261212` tables after 2027-02-20.

## Step C: drop the table (separate migration, after step B)

```sql
drop table if exists public.ai_citations;
```

Also remove `ai_citations` from `src/integrations/supabase/types.ts`. Keep the archive tables for 90 days, then drop them.

## Rollback of step A

1. Function: `git checkout <commit before this PR> -- supabase/functions/ai-bot-tracker` and
   `supabase functions deploy ai-bot-tracker`.
2. RPC: a new migration that re-runs the `get_ai_bot_tracking(uuid, date, date, text)` definition from
   `20261119000001_filters_key_tabs.sql` (with `citationCtr`). The `(uuid, integer)` overload is not needed by the dashboard.
3. Tracker: restore the previous dist. `public/v/5.5.22/` is untouched, so pinned sites are unaffected either way.
   Do not delete `public/v/5.5.23/` once a snippet pinned to it has been copied.
