import React from 'react';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom';
import { Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { MARKETING_ROUTES } from './marketing-routes';

// Marketing pages only — no auth, no dashboard, no Supabase subscriptions
import Index from './pages/Index';
import Features from './pages/Features';
import FeaturesAI from './pages/FeaturesAI';
import FeaturesAnalytics from './pages/FeaturesAnalytics';
import FeaturesCyber from './pages/FeaturesCyber';
import CMP from './pages/CMP';
import Pricing from './pages/Pricing';
import ApiDocs from './pages/ApiDocs';
import Privacy from './pages/Privacy';
import Contact from './pages/Contact';
import TrackingCheckLanding from './pages/TrackingCheckLanding';
import CookieConsentChecker from './pages/CookieConsentChecker';
import WebsiteMigrationCheck from './pages/WebsiteMigrationCheck';
import ContentPage from './components/ContentPage';
import { CONTENT_PAGES } from './content/pages';

// Re-exported so scripts/prerender.mjs reads the same registry the pages use.
export { MARKETING_ROUTES, MARKETING_REDIRECTS, SITE_ORIGIN } from './marketing-routes';

const PAGES: Record<string, React.ComponentType> = {
  '/': Index,
  '/features/': Features,
  '/features/ai/': FeaturesAI,
  '/features/analytics/': FeaturesAnalytics,
  '/features/cyber/': FeaturesCyber,
  '/cmp/': CMP,
  '/pricing/': Pricing,
  '/api/': ApiDocs,
  '/privacy/': Privacy,
  '/contact/': Contact,
  '/tracking-check/': TrackingCheckLanding,
  '/cookie-consent-checker/': CookieConsentChecker,
  '/website-migration-check/': WebsiteMigrationCheck,
  // Docs and integration pages are data rendered by ContentPage.
  ...Object.fromEntries(CONTENT_PAGES.map((page) => [page.path, () => <ContentPage page={page} />])),
};

for (const { path } of MARKETING_ROUTES) {
  if (!PAGES[path]) throw new Error(`entry-server: no page component for registered route ${path}`);
}

export function render(url: string): string {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });

  return renderToString(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
        <StaticRouter location={url}>
          <Routes>
            {Object.entries(PAGES).map(([path, Page]) => (
              <Route key={path} path={path} element={<Page />} />
            ))}
          </Routes>
        </StaticRouter>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
