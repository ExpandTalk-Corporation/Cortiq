import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ClientOnly } from './ClientOnly';

/**
 * Regression guard for the SSG hydration mismatch (React #418 / #423).
 *
 * The marketing pages are prerendered by `entry-server.tsx`, which does NOT
 * render the global client-only widgets (Toaster, Sonner, SiteCookieBanner).
 * The client (App.tsx) must therefore emit no DOM for those widgets during the
 * initial hydration render, or the trees diverge and hydration is aborted.
 *
 * ClientOnly enforces that: on the server / first render it produces nothing.
 * If someone removes the gate, this test fails.
 */
describe('ClientOnly', () => {
  it('renders no markup on the server / hydration pass', () => {
    const html = renderToStaticMarkup(
      <ClientOnly>
        <div data-testid="widget">should not appear during SSR</div>
      </ClientOnly>,
    );
    expect(html).toBe('');
  });

  it('does not leak child markup even for always-visible children', () => {
    const html = renderToStaticMarkup(
      <ClientOnly>
        <ol className="toaster" />
      </ClientOnly>,
    );
    expect(html).not.toContain('<ol');
    expect(html).toBe('');
  });
});
