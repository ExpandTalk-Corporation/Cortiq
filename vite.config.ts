import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { buildSelfTrackingSnippet, readSelfTrackingFiles } from "./scripts/self-tracking-snippet.mjs";

// Injects CortIQ's own consent-gated tracker into index.html when VITE_CORTIQ_SITE_ID and
// VITE_CORTIQ_TRACKING_KEY are set; replaces the <!--cortiq-self-tracking--> marker.
function selfTracking(mode: string): Plugin {
  return {
    name: "cortiq-self-tracking",
    transformIndexHtml(html) {
      const snippet = buildSelfTrackingSnippet(loadEnv(mode, process.cwd(), "VITE_"), readSelfTrackingFiles(__dirname));
      return html.replace("<!--cortiq-self-tracking-->", snippet);
    },
  };
}

export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), selfTracking(mode)],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  publicDir: 'public',
  build: {
    copyPublicDir: true,
  },
  ssr: {
    // Bundle next-themes for SSR — it expects browser globals otherwise
    noExternal: ['next-themes'],
  },
}));
