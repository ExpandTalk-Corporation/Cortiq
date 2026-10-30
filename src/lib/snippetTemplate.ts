// Pure renderer for the install snippet. trackingSnippet.ts supplies the sources via Vite ?raw
// imports; the foundation tests read them from disk.

export interface TrackingSnippetOptions {
  apiUrl: string;
  siteId: string;
  trackingKey: string;
  scriptSrc: string;
  /** Inline the consent-free aggregate beacon (sites.aggregate_measurement). */
  aggregate?: boolean;
}

function stripLineComments(source: string): string {
  return source
    .split('\n')
    .filter(line => !line.trimStart().startsWith('//'))
    .join('\n')
    .trim();
}

export function renderTrackingSnippet(
  { apiUrl, siteId, trackingKey, scriptSrc, aggregate = false }: TrackingSnippetOptions,
  sources: { loader: string; beacon: string },
): string {
  const loader = stripLineComments(sources.loader).replace('__CORTIQ_SRC__', scriptSrc);
  const indent = (code: string) => code.split('\n').map(l => '  ' + l).join('\n');
  const header = aggregate
    ? '<!-- CortIQ Analytics: counts page views without consent (no cookies, no device storage, no IDs); full tracking loads only after analytics consent -->'
    : '<!-- CortIQ Analytics: loads only after analytics consent -->';
  return `${header}
<script>
  window.cortiqConfig = {
    apiUrl: '${apiUrl}',
    siteId: '${siteId}',
    apiKey: '${trackingKey}',
    cookieless: true${aggregate ? ',\n    aggregate: true' : ''}
  };
${aggregate ? indent(stripLineComments(sources.beacon)) + '\n' : ''}${indent(loader)}
</script>`;
}
