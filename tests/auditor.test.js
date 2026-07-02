import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeHtml,
  buildGeneratedKit,
  normalizeUrl,
  parseRobotsTxt,
  parseSitemap
} from '../src/auditor.js';

test('normalizeUrl adds https when protocol is omitted', () => {
  assert.equal(normalizeUrl('example.com/path').href, 'https://example.com/path');
});

test('analyzeHtml extracts metadata, links, images and JSON-LD', () => {
  const html = `
    <!doctype html>
    <html lang="es">
      <head>
        <title>Servicio SEO Madrid</title>
        <meta name="description" content="Consultoria SEO tecnica para negocios locales y ecommerce.">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <link rel="canonical" href="https://example.com/">
        <meta property="og:title" content="Servicio SEO Madrid">
        <meta property="og:description" content="SEO tecnico">
        <script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Example"}</script>
      </head>
      <body>
        <h1>SEO tecnico</h1>
        <a href="/privacidad">Privacidad</a>
        <a href="https://external.example/">Externo</a>
        <img src="/hero.jpg" alt="Panel SEO">
        <img src="/logo.png">
      </body>
    </html>
  `;

  const result = analyzeHtml(html, 'https://example.com/');
  assert.equal(result.title, 'Servicio SEO Madrid');
  assert.equal(result.lang, 'es');
  assert.equal(result.internalLinks.length, 1);
  assert.equal(result.externalLinks.length, 1);
  assert.equal(result.imagesMissingAlt.length, 1);
  assert.deepEqual(result.jsonLdTypes, ['Organization']);
  assert.equal(result.hasOpenGraph, true);
});

test('parseRobotsTxt detects sitemap and global blocking', () => {
  const robots = parseRobotsTxt(`
    User-agent: *
    Disallow: /
    Sitemap: https://example.com/sitemap.xml
  `);

  assert.equal(robots.blocksAll, true);
  assert.deepEqual(robots.sitemaps, ['https://example.com/sitemap.xml']);
});

test('parseSitemap returns loc URLs', () => {
  const sitemap = parseSitemap(`
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url><loc>https://example.com/</loc></url>
      <url><loc>https://example.com/contacto</loc></url>
    </urlset>
  `);

  assert.equal(sitemap.isSitemap, true);
  assert.equal(sitemap.urls.length, 2);
});

test('buildGeneratedKit creates robots, sitemap and legal templates', () => {
  const kit = buildGeneratedKit({
    url: 'https://example.com/',
    siteName: 'Example',
    contactEmail: 'hello@example.com',
    discoveredUrls: ['https://example.com/', 'https://example.com/contacto']
  });

  const robots = kit.files.find((file) => file.path === 'robots.txt');
  const sitemap = kit.files.find((file) => file.path === 'sitemap.xml');
  const privacy = kit.files.find((file) => file.path === 'legal/politica-de-privacidad.md');

  assert.match(robots.content, /Sitemap: https:\/\/example\.com\/sitemap\.xml/);
  assert.match(sitemap.content, /<loc>https:\/\/example\.com\/contacto<\/loc>/);
  assert.match(privacy.content, /hello@example\.com/);
});
