import { useEffect } from 'react';

interface SEOProps {
  title: string;
  description: string;
  canonical?: string;
  /** Keep the page out of search results (404s). Drops the canonical link while mounted. */
  noindex?: boolean;
}

export function useSEO({ title, description, canonical, noindex = false }: SEOProps) {
  useEffect(() => {
    document.title = title;

    const setMeta = (attr: string, val: string, content: string) => {
      let el = document.querySelector(`meta[${attr}="${val}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, val);
        document.head.appendChild(el);
      }
      el.content = content;
    };

    setMeta('name', 'description', description);
    setMeta('property', 'og:title', title);
    setMeta('property', 'og:description', description);
    setMeta('name', 'twitter:title', title);
    setMeta('name', 'twitter:description', description);

    if (noindex) {
      // The SPA fallback serves the prerendered homepage head for unknown URLs, so its
      // canonical has to go too or the 404 reads as a duplicate of the homepage.
      document.querySelector('link[rel="canonical"]')?.remove();
      setMeta('name', 'robots', 'noindex');
      return () => document.querySelector('meta[name="robots"]')?.remove();
    }

    const base = 'https://cortiq.se';
    const href = canonical ?? (base + window.location.pathname);
    let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement('link');
      link.rel = 'canonical';
      document.head.appendChild(link);
    }
    link.href = href;
    setMeta('property', 'og:url', href);
  }, [title, description, canonical, noindex]);
}
