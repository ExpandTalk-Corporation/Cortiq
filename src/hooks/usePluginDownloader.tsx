import { useState } from 'react';

/**
 * Serves the current, canonical CortIQ WordPress plugin.
 *
 * The plugin lives in `wordpress-plugin/` and is packaged into
 * `public/cortiq-wordpress-plugin.zip` by `scripts/build-plugin.mjs` (runs on
 * prebuild), so it is served statically at `/cortiq-wordpress-plugin.zip`. We
 * download that file directly.
 *
 * NOTE: this previously generated an unrelated, stale plugin
 * ("heatmap-analytics-pro" v3.1.0 / embedded PHP v2.0.0) client-side from ~2800
 * lines of hardcoded strings — so the dashboard handed out an obsolete plugin
 * that predated cookieless mode and the consent fixes. Always ship the real zip.
 */
export const usePluginDownloader = () => {
  const [isProcessing, setIsProcessing] = useState(false);

  const downloadPlugin = () => {
    setIsProcessing(true);
    try {
      const a = document.createElement('a');
      a.href = '/cortiq-wordpress-plugin.zip';
      a.download = 'cortiq-analytics.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error downloading plugin:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  return { downloadPlugin, isProcessing };
};
