import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface LinkClickRow {
  page_path: string;
  link_kind: 'link' | 'button';
  link_key: string;
  link_label: string | null;
  total_clicks: number;
  desktop_clicks: number;
  mobile_clicks: number;
  tablet_clicks: number;
}

export function useLinkClickCounts(siteId: string | null, days: number = 30) {
  const [rows, setRows] = useState<LinkClickRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = async (windowDays: number = days) => {
    if (!siteId) { setRows([]); return; }
    setLoading(true);
    setError(null);
    try {
      const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000)
        .toISOString().slice(0, 10);
      const { data, error: qErr } = await supabase
        .from('link_click_counts')
        .select('page_path, link_kind, link_key, link_label, device_type, click_count, day')
        .eq('site_id', siteId)
        .gte('day', since);
      if (qErr) throw qErr;

      const map = new Map<string, LinkClickRow>();
      (data || []).forEach((r: any) => {
        const key = `${r.page_path} ${r.link_kind} ${r.link_key}`;
        let row = map.get(key);
        if (!row) {
          row = {
            page_path: r.page_path, link_kind: r.link_kind, link_key: r.link_key,
            link_label: r.link_label, total_clicks: 0,
            desktop_clicks: 0, mobile_clicks: 0, tablet_clicks: 0,
          };
          map.set(key, row);
        }
        const c = r.click_count || 0;
        row.total_clicks += c;
        if (r.device_type === 'mobile') row.mobile_clicks += c;
        else if (r.device_type === 'tablet') row.tablet_clicks += c;
        else row.desktop_clicks += c;
      });

      setRows(Array.from(map.values()).sort((a, b) => b.total_clicks - a.total_clicks));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load link clicks');
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(days); /* eslint-disable-next-line */ }, [siteId, days]);

  return { rows, loading, error, reload };
}
