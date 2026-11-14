import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { googleAdsOAuth, type GoogleAdsConnection } from '@/hooks/useGoogleAdsConnection';

// Google redirects here after the Google Ads consent screen. The code and the signed state go
// to google-ads-oauth, which checks the state against the signed-in user, stores the sealed
// refresh token server-side and lists the reachable accounts.

// Tabs that render the connect card; anything else returns to Integrations.
const RETURN_TABS = new Set(['integrations', 'paid-ads', 'click-fraud', 'campaigns']);

function returnTab(): string {
  try {
    const tab = sessionStorage.getItem('cortiq_google_ads_return_tab');
    sessionStorage.removeItem('cortiq_google_ads_return_tab');
    return tab && RETURN_TABS.has(tab) ? tab : 'integrations';
  } catch {
    return 'integrations';
  }
}

export default function GoogleAdsCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // an authorization code can be exchanged only once
    started.current = true;
    const tab = returnTab();
    const back = () => navigate(`/dashboard?tab=${tab}`);
    const code = searchParams.get('code');
    const state = searchParams.get('state');

    if (searchParams.get('error')) {
      setStatus('error');
      setMessage('Google authorization was denied or cancelled.');
      setTimeout(back, 3000);
      return;
    }
    if (!code || !state) {
      setStatus('error');
      setMessage('Invalid callback: missing parameters.');
      setTimeout(back, 3000);
      return;
    }

    googleAdsOAuth<{ connection: GoogleAdsConnection | null }>('callback', { code, state })
      .then(({ connection }) => {
        const n = connection?.accessible_customers?.length ?? 0;
        setStatus('success');
        setMessage(connection?.customer_id
          ? `Connected ${connection.descriptive_name ?? 'Google Ads'}. Redirecting...`
          : `Connected. ${n} ${n === 1 ? 'account' : 'accounts'} found; pick the one this site reports on. Redirecting...`);
        setTimeout(back, 2000);
      })
      .catch((err: unknown) => {
        setStatus('error');
        setMessage(err instanceof Error ? err.message : 'Connection failed');
        setTimeout(back, 5000);
      });
  }, [navigate, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4 max-w-sm px-4">
        {status === 'loading' && (
          <>
            <div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto" />
            <p className="text-sm text-muted-foreground">Connecting Google Ads...</p>
          </>
        )}
        {status === 'success' && <p className="font-medium text-green-700">{message}</p>}
        {status === 'error' && (
          <>
            <p className="font-medium text-red-700">Connection failed</p>
            <p className="text-sm text-muted-foreground">{message}</p>
          </>
        )}
      </div>
    </div>
  );
}
