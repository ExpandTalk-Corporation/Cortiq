import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/hooks/useAuth";
import { SiteCookieBanner } from "@/components/SiteCookieBanner";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ClientOnly } from "@/components/ClientOnly";
import Index from "./pages/Index";
import CMP from "./pages/CMP";
import Features from "./pages/Features";
import FeaturesAI from "./pages/FeaturesAI";
import FeaturesAnalytics from "./pages/FeaturesAnalytics";
import FeaturesCyber from "./pages/FeaturesCyber";
import Pricing from "./pages/Pricing";
import Privacy from "./pages/Privacy";
import Contact from "./pages/Contact";
import ApiDocs from "./pages/ApiDocs";
import Dashboard from "./pages/Dashboard";
import Installation from "./pages/Installation";
import Auth from "./pages/Auth";
import GSCCallbackPage from "./pages/auth/GSCCallbackPage";
import Navigation from "./pages/Navigation";
import NotFound from "./pages/NotFound";
import ProtectedRoute from "./components/ProtectedRoute";
import ContentPage from "./components/ContentPage";
import { CONTENT_PAGES } from "./content/pages";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Treat data as fresh for 60s so alt-tabbing back to the dashboard does not
      // fire a wave of refetches against Supabase. Individual hooks can override.
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
        <AuthProvider>
          <TooltipProvider>
          {/* Global client-only widgets. Gated behind ClientOnly so they emit no
              DOM during hydration — the prerendered SSG HTML contains none of
              these, and rendering them here would break hydration (React #418/#423). */}
          <ClientOnly>
            <Toaster />
            <Sonner />
            <SiteCookieBanner />
          </ClientOnly>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/cmp" element={<CMP />} />
              <Route path="/features" element={<Features />} />
              <Route path="/features/ai" element={<FeaturesAI />} />
              <Route path="/features/analytics" element={<FeaturesAnalytics />} />
              <Route path="/features/cyber" element={<FeaturesCyber />} />
              {/* Merged into /features/ai/ — Apache 301s this path; this covers client-side navigation. */}
              <Route path="/bot-intelligence" element={<Navigate to="/features/ai/" replace />} />
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/api" element={<ApiDocs />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/contact" element={<Contact />} />
              {CONTENT_PAGES.map((page) => (
                <Route key={page.path} path={page.path} element={<ContentPage page={page} />} />
              ))}
              <Route path="/auth" element={<Auth />} />
              <Route path="/auth/gsc-callback" element={<GSCCallbackPage />} />
              <Route path="/dashboard" element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              } />
              <Route path="/navigation" element={
                <ProtectedRoute>
                  <Navigation />
                </ProtectedRoute>
              } />
              <Route path="/installation" element={
                <ProtectedRoute>
                  <Installation />
                </ProtectedRoute>
              } />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
