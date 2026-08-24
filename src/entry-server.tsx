import React from 'react';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom';
import { Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';

// Marketing pages only — no auth, no dashboard, no Supabase subscriptions
import Index from './pages/Index';
import Features from './pages/Features';
import FeaturesAI from './pages/FeaturesAI';
import FeaturesAnalytics from './pages/FeaturesAnalytics';
import FeaturesCyber from './pages/FeaturesCyber';
import BotIntelligence from './pages/BotIntelligence';
import CMP from './pages/CMP';
import Pricing from './pages/Pricing';
import ApiDocs from './pages/ApiDocs';
import Privacy from './pages/Privacy';
import Contact from './pages/Contact';

export function render(url: string): string {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });

  return renderToString(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
        <StaticRouter location={url}>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/features" element={<Features />} />
            <Route path="/features/ai" element={<FeaturesAI />} />
            <Route path="/features/analytics" element={<FeaturesAnalytics />} />
            <Route path="/features/cyber" element={<FeaturesCyber />} />
            <Route path="/bot-intelligence" element={<BotIntelligence />} />
            <Route path="/cmp" element={<CMP />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/api" element={<ApiDocs />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/contact" element={<Contact />} />
          </Routes>
        </StaticRouter>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
