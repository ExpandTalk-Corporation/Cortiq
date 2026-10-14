import consentLoader from './consent-loader.js?raw';

export interface TrackingSnippetOptions {
  apiUrl: string;
  siteId: string;
  trackingKey: string;
  scriptSrc: string;
}

/**
 * The install snippet shown in the dashboard. It sets window.cortiqConfig and inlines the
 * consent-gated loader, so the browser requests the tracker (and sends its IP to the tracker's
 * host) only after the visitor's analytics consent.
 */
export function buildTrackingSnippet({ apiUrl, siteId, trackingKey, scriptSrc }: TrackingSnippetOptions): string {
  const loader = consentLoader
    .split('\n')
    .filter(line => !line.trimStart().startsWith('//'))
    .join('\n')
    .replace('__CORTIQ_SRC__', scriptSrc)
    .trim();
  return `<!-- CortIQ Analytics: loads only after analytics consent -->
<script>
  window.cortiqConfig = {
    apiUrl: '${apiUrl}',
    siteId: '${siteId}',
    apiKey: '${trackingKey}',
    cookieless: true
  };
${loader.split('\n').map(l => '  ' + l).join('\n')}
</script>`;
}
