import consentLoader from './consent-loader.js?raw';
import aggregateBeacon from './aggregate-beacon.js?raw';
import { renderTrackingSnippet, type TrackingSnippetOptions } from './snippetTemplate';

export type { TrackingSnippetOptions };

/**
 * The install snippet shown in the dashboard. It sets window.cortiqConfig and inlines the
 * consent-gated loader, so the browser requests the tracker (and sends its IP to the tracker's
 * host) only after the visitor's analytics consent. With `aggregate`, it also inlines the
 * consent-free aggregate beacon (src/lib/aggregate-beacon.js).
 */
export function buildTrackingSnippet(options: TrackingSnippetOptions): string {
  return renderTrackingSnippet(options, { loader: consentLoader, beacon: aggregateBeacon });
}
