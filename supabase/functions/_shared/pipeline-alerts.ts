// Wording for pipeline freshness alerts (migration 20261115000001_pipeline_freshness.sql).
// Shared by the pipeline-freshness Edge Function (email) and the dashboard (src/lib/pipelineAlerts.ts).

export type Pipeline = 'page_views' | 'consents' | 'ai_bots_server' | 'link_clicks' | 'aggregate';

export const PIPELINES: Record<Pipeline, { label: string; check: string }> = {
  page_views: {
    label: 'Page views',
    check: 'Check that the tracking script is still on the site and that the consent banner still loads it after "Accept".',
  },
  consents: {
    label: 'Consent choices',
    check: 'Check that the CortIQ consent banner still shows and can reach CortIQ (CSP connect-src, caching plugins).',
  },
  ai_bots_server: {
    label: 'AI bots (server-side)',
    check: 'Check the server-side adapter (Cloudflare Worker, Next/Netlify middleware or WordPress plugin) and its site key.',
  },
  link_clicks: {
    label: 'Link clicks',
    check: 'Check that the tracking script is still on the site.',
  },
  aggregate: {
    label: 'Aggregate measurement',
    check: 'Check that the aggregate beacon is still in the install snippet or the WordPress plugin.',
  },
};

export interface PipelineAlert {
  id: string;
  site_id: string;
  pipeline: string;
  last_seen_at: string;
  expected: number;
  opened_at: string;
  resolved_at: string | null;
}

export function pipelineLabel(pipeline: string): string {
  return PIPELINES[pipeline as Pipeline]?.label ?? pipeline;
}

/** "Page views stopped 5 days ago; about 30 were expected since." */
export function alertSentence(alert: Pick<PipelineAlert, 'pipeline' | 'last_seen_at' | 'expected'>, now = new Date()): string {
  const hours = Math.max(0, (now.getTime() - Date.parse(alert.last_seen_at)) / 3_600_000);
  const ago = hours < 48 ? `${Math.round(hours)} hours` : `${Math.round(hours / 24)} days`;
  return `${pipelineLabel(alert.pipeline)} stopped arriving ${ago} ago; about ${alert.expected} were expected since, going by the last 28 days.`;
}
