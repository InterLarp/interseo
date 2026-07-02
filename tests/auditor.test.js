import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
  analyzeHtml,
  buildAuditReports,
  buildFixPrompts,
  buildGeneratedKit,
  normalizeUrl,
  parseRobotsTxt,
  parseSitemap
} from '../src/auditor.js';

const sampleHtml = `
  <!doctype html>
  <html lang="es">
    <head>
      <meta charset="utf-8">
      <title>Servicio SEO Madrid</title>
      <meta name="description" content="Consultoria SEO tecnica para negocios locales y ecommerce.">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <link rel="canonical" href="https://example.com/">
      <link rel="alternate" hreflang="es" href="https://example.com/">
      <link rel="manifest" href="/site.webmanifest">
      <meta property="og:title" content="Servicio SEO Madrid">
      <meta property="og:site_name" content="Interseo Demo">
      <meta property="og:description" content="SEO tecnico">
      <meta name="twitter:card" content="summary_large_image">
      <meta name="twitter:title" content="Servicio SEO Madrid">
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

test('normalizeUrl adds https when protocol is omitted', () => {
  assert.equal(normalizeUrl('example.com/path').href, 'https://example.com/path');
});

test('analyzeHtml extracts metadata, links, images, JSON-LD and social data', () => {
  const result = analyzeHtml(sampleHtml, 'https://example.com/');
  assert.equal(result.title, 'Servicio SEO Madrid');
  assert.equal(result.lang, 'es');
  assert.equal(result.charset, 'utf-8');
  assert.equal(result.internalLinks.length, 1);
  assert.equal(result.externalLinks.length, 1);
  assert.equal(result.imagesMissingAlt.length, 1);
  assert.deepEqual(result.jsonLdTypes, ['Organization']);
  assert.equal(result.hasOpenGraph, true);
  assert.equal(result.openGraph.siteName, 'Interseo Demo');
  assert.equal(result.hasTwitterCard, true);
  assert.equal(result.hreflang.length, 1);
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

test('buildGeneratedKit creates robots, sitemap, reports-ready files and legal templates', () => {
  const kit = buildGeneratedKit({
    url: 'https://example.com/',
    discoveredUrls: ['https://example.com/', 'https://example.com/contacto']
  });

  const robots = kit.files.find((file) => file.path === 'robots.txt');
  const sitemap = kit.files.find((file) => file.path === 'sitemap.xml');
  const privacy = kit.files.find((file) => file.path === 'legal/politica-de-privacidad.md');
  const llms = kit.files.find((file) => file.path === 'llms.txt');
  const mcp = kit.files.find((file) => file.path === 'interseo.mcp.json');

  assert.match(robots.content, /Sitemap: https:\/\/example\.com\/sitemap\.xml/);
  assert.match(sitemap.content, /<loc>https:\/\/example\.com\/contacto<\/loc>/);
  assert.match(privacy.content, /contacto@example\.com/);
  assert.match(llms.content, /Sitemap:/);
  assert.match(mcp.content, /src\/mcp\.js/);
});

test('buildFixPrompts creates skill and MCP repair prompts', () => {
  const prompts = buildFixPrompts({
    siteName: 'Example',
    inputUrl: 'https://example.com/',
    finalUrl: 'https://example.com/',
    score: 61,
    grade: { label: 'Mejorable' },
    priority: [{ id: 'sitemap_found', category: 'Rastreo', label: 'Sitemap XML disponible', evidence: 'No se encontro sitemap', recommendation: 'Publica sitemap.xml.' }],
    dns: { resolves: true, lookupMs: 30 },
    sitemap: { found: false },
    robots: { exists: false },
    crawl: { totals: { pages: 1 } },
    kit: { files: [{ path: 'sitemap.xml' }] }
  });

  assert.match(prompts.skill, /Use \$interseo/);
  assert.match(prompts.mcp, /audit_site/);
  assert.match(prompts.direct, /Sitemap XML disponible/);
});

test('buildAuditReports creates markdown and csv summaries', () => {
  const reports = buildAuditReports({
    auditedAt: '2026-07-02T00:00:00.000Z',
    finalUrl: 'https://example.com/',
    score: 88,
    grade: { label: 'Bueno' },
    priority: [{ category: 'Rastreo', label: 'Sitemap XML', recommendation: 'Publica sitemap.' }],
    categories: [{ name: 'Rastreo', percent: 80, score: 20, max: 25 }],
    crawl: { totals: { pages: 1, ok: 1, errors: 0, noindex: 0, duplicateTitles: 0, duplicateDescriptions: 0, brokenInternalLinks: 0 }, pages: [] },
    sitemap: { url: 'https://example.com/sitemap.xml' },
    robots: { url: 'https://example.com/robots.txt' },
    policies: {},
    dns: { hostname: 'example.com', domain: 'example.com', resolves: true, lookupMs: 25, addresses: [{ address: '93.184.216.34' }], ns: ['a.iana-servers.net'], spf: '', dmarc: '' }
  });

  assert.match(reports.markdown, /Informe interseo/);
  assert.match(reports.fixPrompt, /Arregla el SEO tecnico/);
  assert.match(reports.checksCsv, /"category","id","status"/);
  assert.match(reports.pagesCsv, /"url","status","ok"/);
});

test('mcp lists interseo tools', async () => {
  const child = spawn(process.execPath, ['src/mcp.js'], { cwd: process.cwd(), stdio: ['pipe', 'pipe', 'pipe'] });
  const messages = [];
  child.stdout.on('data', (chunk) => {
    for (const line of String(chunk).split(/\r?\n/).filter(Boolean)) {
      messages.push(JSON.parse(line));
    }
  });

  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } })}\n`);
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' })}\n`);

  await new Promise((resolve) => setTimeout(resolve, 300));
  child.kill();

  const list = messages.find((message) => message.id === 2);
  assert.ok(list);
  assert.ok(list.result.tools.some((tool) => tool.name === 'audit_site'));
  assert.ok(list.result.tools.some((tool) => tool.name === 'generate_fix_prompt'));
});