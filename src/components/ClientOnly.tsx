import { useState, useEffect, type ReactNode } from 'react';

/**
 * Renders its children only after the component has mounted on the client.
 *
 * During server-side rendering (SSG) and the initial hydration pass this
 * returns null. That keeps global client-only widgets (toasters, cookie
 * banner) from emitting DOM that the prerendered HTML never contained —
 * which would otherwise abort hydration with a structural mismatch
 * (React errors #418 / #423) and discard the whole SSR tree.
 *
 * The children mount on the next render, after hydration has completed, as a
 * normal client-side update.
 */
export function ClientOnly({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return mounted ? <>{children}</> : null;
}
