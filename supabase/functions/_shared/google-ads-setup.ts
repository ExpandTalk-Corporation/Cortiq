/**
 * Google Ads account setup checks: the conversion action used for lead-quality uploads, whether
 * landing URLs carry utm_campaign (campaign matching), the account time zone, and the
 * gclid -> campaign lookup through click_view. Pure helpers are exported for tests; the GAQL
 * calls go through _shared/google-ads.ts.
 */
// deno-lint-ignore-file no-explicit-any
import { type AdsAuth, gaqlDate, searchStream } from './google-ads.ts';

/**
 * Conversion action types CortIQ can send lead-quality conversions to. Uploads use
 * ConversionUploadService.UploadClickConversions, which only accepts "Import from clicks"
 * actions (type UPLOAD_CLICKS). Website tag actions (WEBPAGE) would need the original tag
 * conversion time to adjust, which CortIQ does not have.
 */
export const UPLOAD_ACTION_TYPES = ['UPLOAD_CLICKS'] as const;

export const CONVERSION_ACTIONS_QUERY = `
  SELECT conversion_action.id, conversion_action.name, conversion_action.type,
         conversion_action.status, conversion_action.category
  FROM conversion_action
  WHERE conversion_action.status = 'ENABLED'
    AND conversion_action.type IN (${UPLOAD_ACTION_TYPES.map((t) => `'${t}'`).join(', ')})
  ORDER BY conversion_action.name`;

export interface ConversionActionOption {
  id: string;
  name: string;
  type: string;
  status: string;
  category: string | null;
}

export function parseConversionActions(rows: any[]): ConversionActionOption[] {
  const out: ConversionActionOption[] = [];
  for (const r of rows ?? []) {
    const a = r?.conversionAction;
    const id = String(a?.id ?? '');
    if (!/^\d{1,20}$/.test(id)) continue;
    if (String(a?.status ?? '') !== 'ENABLED') continue;
    if (!(UPLOAD_ACTION_TYPES as readonly string[]).includes(String(a?.type ?? ''))) continue;
    out.push({ id, name: String(a?.name ?? id), type: String(a.type), status: 'ENABLED', category: a?.category ?? null });
  }
  return out.slice(0, 200);
}

/** What to paste into Google Ads → Admin → Account settings → Tracking → Final URL suffix. */
export const SUGGESTED_FINAL_URL_SUFFIX = 'utm_source=google&utm_medium=cpc&utm_campaign={campaignid}';

/** Does a final URL suffix set utm_campaign (any value, ValueTrack or literal)? */
export function hasUtmCampaign(suffix: unknown): boolean {
  return typeof suffix === 'string' && /(^|[?&])utm_campaign=[^&]+/i.test(suffix.trim());
}

export interface TrackingCheck {
  checked_at: string;
  auto_tagging: boolean | null;
  account_suffix: string | null;
  account_has_utm_campaign: boolean;
  campaigns_checked: number;
  campaigns_without_utm_count: number;
  campaigns_without_utm: { id: string; name: string }[];
  /** Every enabled campaign lands with utm_campaign (account or campaign suffix). */
  ok: boolean;
  suggested_suffix: string;
}

/**
 * Account and campaign final URL suffixes decide whether CortIQ sees utm_campaign. A campaign
 * suffix replaces the account suffix. Ad group and ad suffixes are not read (they are rare and
 * would need one more query per level), so a campaign may be covered at those levels and still
 * be listed here.
 */
export function assessTracking(customer: any, campaigns: any[], now = new Date()): TrackingCheck {
  const accountSuffix = typeof customer?.finalUrlSuffix === 'string' && customer.finalUrlSuffix.trim() ? customer.finalUrlSuffix.trim() : null;
  const accountHas = hasUtmCampaign(accountSuffix);
  const without: { id: string; name: string }[] = [];
  let checked = 0;
  for (const r of campaigns ?? []) {
    const c = r?.campaign;
    if (!c?.id) continue;
    checked++;
    const own = typeof c.finalUrlSuffix === 'string' && c.finalUrlSuffix.trim() ? c.finalUrlSuffix : null;
    const covered = own !== null ? hasUtmCampaign(own) : accountHas;
    if (!covered) without.push({ id: String(c.id), name: String(c.name ?? c.id) });
  }
  return {
    checked_at: now.toISOString(),
    auto_tagging: typeof customer?.autoTaggingEnabled === 'boolean' ? customer.autoTaggingEnabled : null,
    account_suffix: accountSuffix,
    account_has_utm_campaign: accountHas,
    campaigns_checked: checked,
    campaigns_without_utm_count: without.length,
    campaigns_without_utm: without.slice(0, 20),
    ok: without.length === 0 && (checked > 0 || accountHas),
    suggested_suffix: SUGGESTED_FINAL_URL_SUFFIX,
  };
}

export interface AccountSetup {
  time_zone: string | null;
  currency_code: string | null;
  conversion_actions: ConversionActionOption[];
  tracking_check: TrackingCheck | null;
  errors: string[];
}

/** One round of setup reads for the picked account. Each part fails on its own. */
export async function loadAccountSetup(auth: AdsAuth): Promise<AccountSetup> {
  const [actions, customer, campaigns] = await Promise.allSettled([
    searchStream(auth, CONVERSION_ACTIONS_QUERY, 30_000),
    searchStream(auth, `SELECT customer.time_zone, customer.currency_code, customer.final_url_suffix, customer.auto_tagging_enabled FROM customer LIMIT 1`, 20_000),
    searchStream(auth, `SELECT campaign.id, campaign.name, campaign.final_url_suffix FROM campaign WHERE campaign.status = 'ENABLED' LIMIT 1000`, 30_000),
  ]);
  const errors: string[] = [];
  const msg = (r: PromiseRejectedResult) => (r.reason instanceof Error ? r.reason.message : String(r.reason)).slice(0, 200);
  if (actions.status === 'rejected') errors.push(`conversion actions: ${msg(actions)}`);
  if (customer.status === 'rejected') errors.push(`account: ${msg(customer)}`);
  if (campaigns.status === 'rejected') errors.push(`campaigns: ${msg(campaigns)}`);
  const c = customer.status === 'fulfilled' ? customer.value[0]?.customer : null;
  return {
    time_zone: isValidTimeZone(c?.timeZone) ? c.timeZone : null,
    currency_code: typeof c?.currencyCode === 'string' ? c.currencyCode : null,
    conversion_actions: actions.status === 'fulfilled' ? parseConversionActions(actions.value) : [],
    tracking_check: customer.status === 'fulfilled' && campaigns.status === 'fulfilled' ? assessTracking(c, campaigns.value) : null,
    errors,
  };
}

/** IANA zone names only ("Europe/Stockholm"); anything Intl rejects is invalid. */
export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !/^[A-Za-z][A-Za-z0-9_+\-/]{0,63}$/.test(tz)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Calendar date (YYYY-MM-DD) of `d` in `tz`. */
export function dayInZone(d: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** click_view answers one day per query and only for the last 90 days. */
export const CLICK_VIEW_MAX_AGE_DAYS = 90;
/** At most this many days are queried per analysis (most recent first). */
export const CLICK_VIEW_MAX_DAYS = 31;
/** Stop collecting gclids beyond this many; the RPC caps its input at 50,000. */
export const CLICK_VIEW_MAX_GCLIDS = 20_000;

/**
 * Days to look up in click_view: days with Ads clicks, inside the range and inside click_view's
 * 90-day window (counted in the account time zone), newest first, at most CLICK_VIEW_MAX_DAYS.
 */
export function clickViewDays(adsDays: Record<string, { clicks: number }>, from: string, to: string, today: string): {
  days: string[]; tooOld: number; overLimit: number;
} {
  const oldest = new Date(Date.parse(`${today}T00:00:00Z`) - (CLICK_VIEW_MAX_AGE_DAYS - 1) * 86_400_000).toISOString().slice(0, 10);
  const withClicks = Object.entries(adsDays)
    .filter(([d, v]) => d >= from && d <= to && v.clicks > 0)
    .map(([d]) => d)
    .sort()
    .reverse();
  const recent = withClicks.filter((d) => d >= oldest && d <= today);
  return {
    days: recent.slice(0, CLICK_VIEW_MAX_DAYS),
    tooOld: withClicks.length - recent.length,
    overLimit: Math.max(0, recent.length - CLICK_VIEW_MAX_DAYS),
  };
}

export interface ClickCampaignMap {
  /** gclid -> Ads campaign id. Never returned to the browser. */
  map: Record<string, string>;
  days_queried: number;
  gclids: number;
  capped: boolean;
  errors: string[];
}

/** gclid -> campaign id for the given days through click_view, 4 days in parallel. */
export async function loadClickCampaigns(auth: AdsAuth, days: string[]): Promise<ClickCampaignMap> {
  const out: ClickCampaignMap = { map: {}, days_queried: 0, gclids: 0, capped: false, errors: [] };
  const queue = [...days];
  const worker = async () => {
    while (queue.length > 0 && !out.capped) {
      const day = queue.shift()!;
      try {
        const rows = await searchStream(auth, `
          SELECT click_view.gclid, campaign.id
          FROM click_view
          WHERE segments.date = '${gaqlDate(day)}'`, 45_000);
        out.days_queried++;
        for (const r of rows) {
          const gclid = r?.clickView?.gclid;
          const campaignId = String(r?.campaign?.id ?? '');
          if (typeof gclid !== 'string' || !gclid || gclid.length > 200 || !/^\d+$/.test(campaignId)) continue;
          if (out.gclids >= CLICK_VIEW_MAX_GCLIDS) { out.capped = true; break; }
          if (!(gclid in out.map)) out.gclids++;
          out.map[gclid] = campaignId;
        }
      } catch (e) {
        if (out.errors.length < 3) out.errors.push(`click_view ${day}: ${(e instanceof Error ? e.message : String(e)).slice(0, 160)}`);
      }
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  return out;
}
