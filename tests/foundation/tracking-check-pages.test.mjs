import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSitemap, suggestPages, fetchSitemapUrls } from '../../supabase/functions/_shared/tracking-check/pages.ts';

test('parses url sets and sitemap indexes', () => {
  assert.deepEqual(parseSitemap('<urlset><url><loc> https://a.example/x?a=1&amp;b=2 </loc></url></urlset>'),
    { pages: ['https://a.example/x?a=1&b=2'], sitemaps: [] });
  assert.deepEqual(parseSitemap('<sitemapindex><sitemap><loc>https://a.example/s1.xml</loc></sitemap></sitemapindex>'),
    { pages: [], sitemaps: ['https://a.example/s1.xml'] });
});

test('suggests home, then form pages, then shallow pages, capped by limit', () => {
  const urls = ['https://www.a.example/blog/2020/long-post/', 'https://a.example/pricing/', 'https://a.example/about/',
    'https://a.example/get-started/', 'https://other.example/contact/', 'https://a.example/blog/'];
  const pages = suggestPages(urls, 'https://a.example', 4);
  assert.deepEqual(pages.map((p) => p.path), ['/', '/pricing/', '/get-started/', '/blog/', '/about/', '/blog/2020/long-post/']);
  assert.deepEqual(pages.filter((p) => p.selected).map((p) => p.path), ['/', '/pricing/', '/get-started/', '/blog/']);
  assert.equal(pages[1].reason, 'form');
  assert.ok(!pages.some((p) => p.path === '/contact/'), 'other hosts are ignored');
});

test('follows a sitemap index and tolerates missing sitemaps', async () => {
  const fetchImpl = async (url) => {
    const p = new URL(url).pathname;
    if (p === '/sitemap.xml') return new Response('<sitemapindex><sitemap><loc>https://a.example/s1.xml</loc></sitemap></sitemapindex>');
    if (p === '/s1.xml') return new Response('<urlset><url><loc>https://a.example/pricing/</loc></url></urlset>');
    return new Response('', { status: 404 });
  };
  assert.deepEqual(await fetchSitemapUrls('https://a.example', { fetchImpl, resolve: async () => ['93.184.215.14'] }), ['https://a.example/pricing/']);
  const none = async () => new Response('', { status: 404 });
  assert.deepEqual(await fetchSitemapUrls('https://a.example', { fetchImpl: none, resolve: async () => ['93.184.215.14'] }), []);
});
