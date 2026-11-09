import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSitemap, suggestPages, discoverPages, parseLinks, parseRobotsSitemaps } from '../../supabase/functions/_shared/tracking-check/pages.ts';

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

test('a directory of hint matches counts as form pages only twice', () => {
  const people = 'abcdefgh'.split('').map((c) => `https://a.example/sv/contacts/${c}.html`);
  const pages = suggestPages(['https://a.example/offert', 'https://a.example/kontakt', 'https://a.example/tjanster/', ...people], 'https://a.example', 6);
  assert.deepEqual(pages.filter((p) => p.selected).map((p) => p.path), ['/', '/offert', '/kontakt', '/sv/contacts/a.html', '/sv/contacts/b.html', '/tjanster/']);
  assert.equal(pages.find((p) => p.path === '/sv/contacts/c.html').reason, 'sitemap');
  const nested = suggestPages(['https://a.example/sv/contacts/a/anna.html', 'https://a.example/sv/contacts/m/my.html', 'https://a.example/sv/contacts/x.html', 'https://a.example/lookbook/'], 'https://a.example');
  assert.deepEqual(nested.filter((p) => p.reason === 'form').map((p) => p.path), ['/sv/contacts/x.html', '/sv/contacts/m/my.html']);
});

test('"demo" must be the whole word', () => {
  const pages = suggestPages(['https://a.example/ai/democratisation-of-ai.html', 'https://a.example/demo', 'https://a.example/sv/demos/', 'https://a.example/en/book-a-demo/'], 'https://a.example');
  assert.deepEqual(pages.filter((p) => p.reason === 'form').map((p) => p.path).sort(), ['/demo', '/en/book-a-demo/', '/sv/demos/']);
});

const resolve = async () => ['93.184.215.14'];
const html = (paths) => `<html><body>${paths.map((p) => `<a class="x" href="${p}">${p}</a>`).join('')}</body></html>`;

test('follows a sitemap index and tolerates missing sitemaps', async () => {
  const fetchImpl = async (url) => {
    const p = new URL(url).pathname;
    if (p === '/sitemap.xml') return new Response('<sitemapindex><sitemap><loc>https://a.example/s1.xml</loc></sitemap></sitemapindex>');
    if (p === '/s1.xml') return new Response('<urlset><url><loc>https://a.example/pricing/</loc></url></urlset>');
    return new Response('', { status: 404 });
  };
  const found = await discoverPages('https://a.example', { fetchImpl, resolve });
  assert.deepEqual(found, { urls: ['https://a.example/pricing/'], source: 'sitemap', from: '/sitemap.xml', blockedStatus: null, viaBrowser: false });
  const none = async () => new Response('', { status: 404 });
  assert.deepEqual(await discoverPages('https://a.example', { fetchImpl: none, resolve }),
    { urls: [], source: null, from: null, blockedStatus: null, viaBrowser: false });
});

test('uses the sitemap that robots.txt names', async () => {
  const fetchImpl = async (url) => {
    const p = new URL(url).pathname;
    if (p === '/robots.txt') return new Response('User-agent: *\nSitemap: https://a.example/maps/main.xml\n');
    if (p === '/maps/main.xml') return new Response('<urlset><url><loc>https://a.example/about/</loc></url></urlset>');
    return new Response('', { status: 404 });
  };
  const found = await discoverPages('https://a.example', { fetchImpl, resolve });
  assert.equal(found.from, '/maps/main.xml');
  assert.deepEqual(parseRobotsSitemaps('sitemap: https://a.example/x.xml\nDisallow: /'), ['https://a.example/x.xml']);
});

test('parses same-site page links and drops files, fragments and other sites', () => {
  const links = parseLinks('<a href="/about/">A</a><a data-x="1" href=\'contact?x=1\'>C</a><a href="/file.pdf">P</a>'
    + '<a href="#top">T</a><a href="https://other.example/">O</a><a href="mailto:x@a.example">M</a><abbr href="/no/">', 'https://www.a.example/en/');
  assert.deepEqual(links, ['https://www.a.example/about/', 'https://www.a.example/en/contact']);
});

test('falls back to an HTML sitemap, then to homepage links', async () => {
  const sitemapHtml = html(['/a/', '/b/', '/c/', '/d/', '/e/']);
  const withHtml = async (url) => new URL(url).pathname === '/sitemap.html' ? new Response(sitemapHtml) : new Response('', { status: 404 });
  const a = await discoverPages('https://a.example', { fetchImpl: withHtml, resolve });
  assert.equal(a.source, 'html-sitemap');
  assert.equal(a.from, '/sitemap.html');
  assert.equal(a.urls.length, 5);

  const homeOnly = async (url) => new URL(url).pathname === '/' ? new Response(html(['/pricing/', '/blog/'])) : new Response('', { status: 404 });
  const b = await discoverPages('https://a.example', { fetchImpl: homeOnly, resolve });
  assert.deepEqual([b.source, b.from, b.urls], ['links', '/', ['https://a.example/pricing/', 'https://a.example/blog/']]);
});

test('reports a blocked sitemap and reads the links in a browser', async () => {
  const blocked = async () => new Response('Access Denied', { status: 403 });
  const asked = [];
  const browserLinks = async (urls, enough) => {
    asked.push(...urls);
    assert.equal(enough, 5);
    return [{ url: 'https://www.a.example/sitemap.html', status: 200, links: ['/a/', '/b/', '/c/', '/d/', '/e/', '/f/'].map((p) => `https://www.a.example${p}`) }];
  };
  const found = await discoverPages('https://www.a.example', { fetchImpl: blocked, resolve, browserLinks });
  assert.deepEqual(asked, ['https://www.a.example/sitemap.html', 'https://www.a.example/']);
  assert.equal(found.source, 'html-sitemap');
  assert.equal(found.blockedStatus, 403);
  assert.equal(found.viaBrowser, true);
  assert.equal(found.urls.length, 6);

  const failing = async () => { throw new Error('Browser service 500'); };
  const none = await discoverPages('https://www.a.example', { fetchImpl: blocked, resolve, browserLinks: failing });
  assert.deepEqual([none.urls, none.blockedStatus], [[], 403]);
});
