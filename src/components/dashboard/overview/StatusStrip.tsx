// src/components/dashboard/overview/StatusStrip.tsx
import { formatDistanceToNow } from 'date-fns';

const DAY_MS = 86_400_000;

export function StatusStrip({ domain, trackingMode, lastPageViewAt, lastServerHitAt, onNavigate }: {
  domain: string; trackingMode: 'cookieless' | 'full'; lastPageViewAt: string | null;
  lastServerHitAt: string | null; onNavigate: (tab: string) => void;
}) {
  const receiving = lastPageViewAt && Date.now() - Date.parse(lastPageViewAt) < DAY_MS;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
      <span className="text-lg font-semibold">{domain}</span>
      <span className="flex items-center gap-1.5">
        <span className={`h-2 w-2 rounded-full ${receiving ? 'bg-emerald-500' : 'bg-amber-500'}`} aria-hidden="true" />
        {receiving
          ? 'Receiving data'
          : lastPageViewAt ? `No page views for ${formatDistanceToNow(new Date(lastPageViewAt))}` : 'No page views yet'}
      </span>
      <span className="text-muted-foreground">|</span>
      <span>{trackingMode === 'cookieless' ? 'Cookieless mode' : 'Full mode'}</span>
      <span className="text-muted-foreground">|</span>
      {lastServerHitAt
        ? <span>Server-side: last hit {formatDistanceToNow(new Date(lastServerHitAt))} ago</span>
        : <button type="button" className="text-primary underline-offset-2 hover:underline" onClick={() => onNavigate('server-logs')}>
            Server-side measurement not set up
          </button>}
    </div>
  );
}
