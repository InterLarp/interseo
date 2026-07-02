import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { auditSource } from '../src/source-auditor.js';

async function fixture() {
  return mkdtemp(path.join(os.tmpdir(), 'interseo-'));
}

async function write(root, file, content) {
  const target = path.join(root, file);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, 'utf8');
}

function page(title, body) {
  return `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><meta name="description" content="${title} description"><link rel="canonical" href="https://example.com/"></head><body><h1>${title}</h1>${body}</body></html>`;
}

test('self-links do not hide orphan pages', async () => {
  const root = await fixture();
  await write(root, 'index.html', page('Home', '<a href="/about/">About</a>'));
  await write(root, 'about/index.html', page('About', '<p>About page linked from home.</p>'));
  await write(root, 'orphan.html', page('Orphan', '<a href="/orphan.html">Self</a>'));

  const result = await auditSource({ dir: root, baseUrl: 'https://example.com' });

  assert.equal(result.orphanPages.includes('about/index.html'), false);
  assert.equal(result.orphanPages.includes('orphan.html'), true);
});

test('sitemap indexes are not treated as page URL lists', async () => {
  const root = await fixture();
  await write(root, 'index.html', page('Home', '<p>Home page.</p>'));
  await write(root, 'sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://example.com/sitemap-pages.xml</loc></sitemap>
</sitemapindex>`);

  const result = await auditSource({ dir: root, baseUrl: 'https://example.com' });
  const check = result.checks.find((item) => item.id === 'sitemap_urls_exist');

  assert.equal(result.sitemap.isIndex, true);
  assert.deepEqual(result.sitemapMissingFiles, []);
  assert.equal(check.status, 'pass');
});