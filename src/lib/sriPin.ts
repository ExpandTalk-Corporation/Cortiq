// Pinned installs with Subresource Integrity. scripts/pin-tracker.mjs writes the manifest
// (src/lib/sri-manifest.json) and the files under public/v/<version>/; this module turns it into
// snippet options and tells a site pinned to an older version what it is missing.

export interface SriManifest {
  latest: string;
  versions: Record<string, { securityFix: boolean; files: Record<string, string> }>;
}

export interface PinnedScripts {
  version: string;
  scriptSrc: string;
  scriptIntegrity: string;
  bannerSrc: string;
  bannerIntegrity: string;
}

/** URLs and hashes of the latest pinned tracker and banner, served from `origin`. */
export function pinnedScripts(origin: string, manifest: SriManifest): PinnedScripts {
  const version = manifest.latest;
  const files = manifest.versions[version]?.files;
  if (!files?.['cortiq.js'] || !files['consent-banner.js']) throw new Error(`No pinned files for ${version}`);
  return {
    version,
    scriptSrc: `${origin}/v/${version}/cortiq.js`,
    scriptIntegrity: files['cortiq.js'],
    bannerSrc: `${origin}/v/${version}/consent-banner.js`,
    bannerIntegrity: files['consent-banner.js'],
  };
}

export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return Math.sign(d);
  }
  return 0;
}

export interface PinStatus {
  latest: string;
  /** A newer pinned version exists. */
  behind: boolean;
  /** Newer versions that fix a security issue, oldest first. */
  securityFixes: string[];
}

/** Where a site pinned to `pinned` stands, or null when it uses the auto-updating snippet. */
export function pinStatus(pinned: string | null | undefined, manifest: SriManifest): PinStatus | null {
  if (!pinned) return null;
  const newer = Object.keys(manifest.versions)
    .filter(v => compareVersions(v, pinned) > 0)
    .sort(compareVersions);
  return {
    latest: manifest.latest,
    behind: newer.length > 0,
    securityFixes: newer.filter(v => manifest.versions[v].securityFix),
  };
}
