import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  analyzeHtml,
  cleanText,
  findDuplicates,
  parseRobotsTxt,
  parseSitemap,
  scoreToGrade,
  summarizeCategories
} from './analyzer.js';

const DEFAULT_BASE_URL = 'https://example.com';
const DEFAULT_PAGE_LIMIT = 200;
const MAX_FILES = 5000;
const SKIP_DIRS = new Set(['node_modules', '.git', '.github', '.vscode', '.idea', 'coverage', '__pycache__', '.cache']);

const SOURCE_CHECKS = [
  { id: 'pages_found', category: 'Crawl', max: 6 },
  { id: 'robots_txt', category: 'Crawl', max: 4 },
  { id: 'robots_not_blocking', category: 'Crawl', max: 4 },
  { id: 'sitemap_file', category: 'Crawl', max: 6 },
  { id: 'sitemap_urls_exist', category: 'Crawl', max: 4 },
  { id: 'titles_present', category: 'Content', max: 5 },
  { id: 'titles_unique', category: 'Content', max: 4 },
  { id: 'descriptions_present', category: 'Content', max: 5 },
  { id: 'descriptions_unique', category: 'Content', max: 3 },
  { id: 'h1_present', category: 'Content', max: 4 },
  { id: 'lang_declared', category: 'Content', max: 3 },
  { id: 'viewport_present', category: 'Content', max: 3 },
  { id: 'image_alt', category: 'Content', max: 3 },
  { id: 'thin_content', category: 'Content', max: 3 },
  { id: 'canonical_present', category: 'Indexing', max: 3 },
  { id: 'noindex_review', category: 'Indexing', max: 3 },
  { id: 'no_meta_refresh', category: 'Indexing', max: 2 },
  { id: 'structured_data_home', category: 'Indexing', max: 4 },
  { id: 'open_graph_home', category: 'Indexing', max: 3 },
  { id: 'favicon_home', category: 'Indexing', max: 2 },
  { id: 'legal_pages', category: 'Trust', max: 4 },
  { id: 'contact_page', category: 'Trust', max: 2 },
  { id: 'mixed_content', category: 'Trust', max: 3 },
  { id: 'broken_links', category: 'Links', max: 6 },
  { id: 'orphan_pages', category: 'Links', max: 3 }
];

export async function auditSource(input) {
  const request = typeof input === 'string' ? { dir: input } : input || {};
  const rootDir = path.resolve(String(request.dir || '.'));
  const baseUrl = normalizeBaseUrl(request.baseUrl || request.base || DEFAULT_BASE_URL);
  const pageLimit = Math.max(1, Math.min(Number(request.pageLimit) || DEFAULT_PAGE_LIMIT, DEFAULT_PAGE_LIMIT));
  const startedAt = Date.now();

  const allFiles = await walkFiles(rootDir);
  const fileSet = new Set(allFiles.map((file) => file.toLowerCase()));
  const htmlFiles = allFiles.filter((file) => /\.html?$/i.test(file)).slice(0, pageLimit);

  const pages = [];
  for (const file of htmlFiles) {
    const html = await readFile(path.join(rootDir, file), 'utf8').catch(() => '');
    const pageUrl = fileToUrl(file, baseUrl);
    const analysis = analyzeHtml(html, pageUrl);
    pages.push({ file, url: pageUrl, ...pickPageFields(analysis), links: analysis.links });
  }

  const home = pages.find((page) => /^index\.html?$/i.test(page.file)) || pages[0] || null;
  const robotsRaw = fileSet.has('robots.txt') ? await readFile(path.join(rootDir, 'robots.txt'), 'utf8').catch(() => '') : '';
  const robots = parseRobotsTxt(robotsRaw);
  const sitemapFile = allFiles.find((file) => /^sitemap[^/]*\.xml$/i.test(file)) || '';
  const sitemapRaw = sitemapFile ? await readFile(path.join(rootDir, sitemapFile), 'utf8').catch(() => '') : '';
  const sitemap = parseSitemap(sitemapRaw);
  const sitemapPageUrls = sitemap.isIndex ? [] : sitemap.urls;

  const brokenLinks = findBrokenLinks(pages, fileSet, baseUrl);
  const sitemapMissingFiles = findSitemapMissingFiles(sitemapPageUrls, fileSet);
  const referenced = collectReferencedFiles(pages, sitemapPageUrls, fileSet, baseUrl);
  const orphanPages = pages
    .filter((page) => page !== home && !referenced.has(page.file.toLowerCase()))
    .map((page) => page.file);
  const totals = buildTotals(pages, brokenLinks, sitemapMissingFiles, orphanPages);
  const checks = buildSourceChecks({
    pages,
    home,
    totals,
    brokenLinks,
    sitemapMissingFiles,
    orphanPages,
    hasRobots: fileSet.has('robots.txt'),
    robots,
    sitemapFile,
    sitemap,
    files: allFiles
  });

  const rawScore = checks.reduce((sum, check) => sum + check.points, 0);
  const rawMax = checks.reduce((sum, check) => sum + check.max, 0);
  const score = rawMax ? Math.round((rawScore / rawMax) * 100) : 0;

  const result = {
    auditedAt: new Date().toISOString(),
    elapsedMs: Date.now() - startedAt,
    mode: 'source',
    dir: rootDir,
    baseUrl,
    score,
    maxScore: 100,
    grade: scoreToGrade(score),
    categories: summarizeCategories(checks),
    checks,
    priority: checks
      .filter((check) => check.status !== 'pass')
      .sort((a, b) => (b.max - b.points) - (a.max - a.points)),
    totals,
    brokenLinks: brokenLinks.slice(0, 50),
    sitemapMissingFiles: sitemapMissingFiles.slice(0, 50),
    orphanPages: orphanPages.slice(0, 50),
    pages: pages.map(({ links, ...page }) => page),
    robots: { exists: fileSet.has('robots.txt'), blocksAll: robots.blocksAll, sitemaps: robots.sitemaps },
    sitemap: { file: sitemapFile, isSitemap: sitemap.isSitemap, isIndex: sitemap.isIndex, urlCount: sitemap.urls.length }
  };

  result.fixPrompt = buildSourceFixPrompt(result);
  result.report = buildSourceMarkdown(result);
  return result;
}

async function walkFiles(rootDir, current = '', collected = []) {
  if (collected.length >= MAX_FILES) return collected;
  const entries = await readdir(path.join(rootDir, current), { withFileTypes: true }).catch((error) => {
    if (!current) throw new Error(`Cannot read directory: ${rootDir} (${error.code || error.message})`);
    return [];
  });

  for (const entry of entries) {
    if (collected.length >= MAX_FILES) break;
    const relative = current ? `${current}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
      await walkFiles(rootDir, relative, collected);
    } else if (entry.isFile()) {
      collected.push(relative);
    }
  }
  return collected;
}

function normalizeBaseUrl(raw) {
  const value = String(raw || DEFAULT_BASE_URL).trim();
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return url.origin;
  } catch {
    return DEFAULT_BASE_URL;
  }
}

function fileToUrl(file, baseUrl) {
  const posix = file.replace(/\\/g, '/');
  const pathname = /(?:^|\/)index\.html?$/i.test(posix)
    ? `/${posix.replace(/index\.html?$/i, '')}`
    : `/${posix}`;
  return new URL(pathname.replace(/\/+/g, '/'), baseUrl).href;
}

function pickPageFields(analysis) {
  return {
    title: analysis.title,
    titleLength: analysis.titleLength,
    description: analysis.description,
    descriptionLength: analysis.descriptionLength,
    canonical: analysis.canonical,
    lang: analysis.lang,
    viewport: analysis.viewport,
    noindex: analysis.noindex,
    metaRefresh: analysis.metaRefresh,
    h1Count: analysis.h1.length,
    wordCount: analysis.wordCount,
    imagesMissingAlt: analysis.imagesMissingAlt.length,
    images: analysis.images.length,
    jsonLdTypes: analysis.jsonLdTypes,
    hasOpenGraph: analysis.hasOpenGraph,
    favicon: analysis.favicon,
    mixedContent: analysis.mixedContent.length,
    internalLinks: analysis.internalLinks.length
  };
}

function findSitemapMissingFiles(urls, fileSet) {
  const missing = [];
  for (const raw of urls) {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(raw).pathname);
    } catch {
      continue;
    }
    if (!pathExistsInSource(pathname, fileSet)) {
      missing.push({ url: raw, target: pathname });
    }
  }
  return missing;
}

function findBrokenLinks(pages, fileSet, baseUrl) {
  const origin = new URL(baseUrl).origin;
  const broken = [];
  const checked = new Set();

  for (const page of pages) {
    for (const link of page.links || []) {
      let url;
      try {
        url = new URL(link.url);
      } catch {
        continue;
      }
      if (url.origin !== origin) continue;

      const pathname = decodeURIComponent(url.pathname);
      const key = `${page.file}->${pathname}`;
      if (checked.has(key)) continue;
      checked.add(key);

      if (!pathExistsInSource(pathname, fileSet)) {
        broken.push({ file: page.file, href: link.href, target: pathname });
      }
    }
  }
  return broken;
}

function resolveSourcePath(pathname, fileSet) {
  const clean = pathname.replace(/^\/+/, '').replace(/\/+$/, '').toLowerCase();
  const candidates = clean
    ? [clean, `${clean}/index.html`, `${clean}/index.htm`, `${clean}.html`, `${clean}.htm`]
    : ['index.html', 'index.htm'];
  return candidates.find((candidate) => fileSet.has(candidate)) || '';
}

function pathExistsInSource(pathname, fileSet) {
  return Boolean(resolveSourcePath(pathname, fileSet));
}

function collectReferencedFiles(pages, sitemapUrls, fileSet, baseUrl) {
  const origin = new URL(baseUrl).origin;
  const referenced = new Set();
  const add = (raw, sourceFile = '') => {
    let url;
    try {
      url = new URL(raw);
    } catch {
      return;
    }
    if (url.origin !== origin) return;
    const match = resolveSourcePath(decodeURIComponent(url.pathname), fileSet);
    if (match && match !== sourceFile.toLowerCase()) referenced.add(match);
  };

  for (const page of pages) {
    for (const link of page.links || []) add(link.url, page.file);
  }
  for (const raw of sitemapUrls) add(raw);
  return referenced;
}

function buildTotals(pages, brokenLinks, sitemapMissingFiles, orphanPages) {
  return {
    pages: pages.length,
    missingTitle: pages.filter((page) => !page.title).length,
    missingDescription: pages.filter((page) => !page.description).length,
    missingH1: pages.filter((page) => page.h1Count === 0).length,
    multipleH1: pages.filter((page) => page.h1Count > 1).length,
    missingLang: pages.filter((page) => !page.lang).length,
    missingViewport: pages.filter((page) => !page.viewport).length,
    missingCanonical: pages.filter((page) => !page.canonical).length,
    noindex: pages.filter((page) => page.noindex).length,
    metaRefresh: pages.filter((page) => page.metaRefresh).length,
    thinContent: pages.filter((page) => page.wordCount < 120).length,
    imagesMissingAlt: pages.reduce((sum, page) => sum + page.imagesMissingAlt, 0),
    mixedContent: pages.reduce((sum, page) => sum + page.mixedContent, 0),
    duplicateTitles: countDuplicateInstances(pages.map((page) => page.title)),
    duplicateDescriptions: countDuplicateInstances(pages.map((page) => page.description)),
    brokenInternalLinks: brokenLinks.length,
    sitemapMissingFiles: sitemapMissingFiles.length,
    orphanPages: orphanPages.length
  };
}

function countDuplicateInstances(values) {
  return findDuplicates(values.filter(Boolean)).reduce((sum, item) => sum + item.count - 1, 0);
}

function buildSourceChecks({ pages, home, totals, brokenLinks, sitemapMissingFiles, orphanPages, hasRobots, robots, sitemapFile, sitemap, files }) {
  const total = pages.length || 1;
  const legalPattern = /(privacy|cookies|cookie-policy|legal|terms|terms-of-service|notice)/i;
  const contactPattern = /(contact|about|team|company)/i;
  const hasLegal = files.some((file) => legalPattern.test(file)) || pages.some((page) => legalPattern.test(page.file));
  const hasContact = files.some((file) => contactPattern.test(file));
  const jsonLdUseful = (home?.jsonLdTypes || []).length > 0;

  const ratio = (bad) => bad === 0 ? 1 : bad <= Math.ceil(total * 0.2) ? 0.5 : 0;
  const scaled = (id, bad, label, evidence, recommendation) => {
    const definition = SOURCE_CHECKS.find((item) => item.id === id);
    const points = Math.round(definition.max * ratio(bad));
    return makeSourceCheck({ id, points, label, evidence, recommendation });
  };

  return [
    makeSourceCheck({
      id: 'pages_found',
      points: pages.length > 0 ? 6 : 0,
      label: 'HTML pages found',
      evidence: `${pages.length} HTML page(s) analyzed`,
      recommendation: 'Audit the folder that contains the final HTML, such as dist/ or public/.'
    }),
    makeSourceCheck({
      id: 'robots_txt',
      points: hasRobots ? 4 : 0,
      label: 'robots.txt is present',
      evidence: hasRobots ? 'robots.txt found' : 'No robots.txt found at the publish root',
      recommendation: 'Add robots.txt at the publish root with a Sitemap directive.'
    }),
    makeSourceCheck({
      id: 'robots_not_blocking',
      points: robots.blocksAll ? 0 : 4,
      label: 'robots.txt does not block the whole site',
      evidence: robots.blocksAll ? 'Disallow: / found for *' : 'No global block',
      recommendation: 'Avoid a global Disallow: / unless the environment should not be indexed.'
    }),
    makeSourceCheck({
      id: 'sitemap_file',
      points: sitemapFile && sitemap.isSitemap ? 6 : sitemapFile ? 2 : 0,
      label: 'sitemap.xml is present and valid',
      evidence: sitemapFile ? `${sitemapFile} with ${sitemap.urls.length} URL(s)` : 'No sitemap*.xml found',
      recommendation: 'Generate a sitemap.xml with the final site URLs.'
    }),
    makeSourceCheck({
      id: 'sitemap_urls_exist',
      points: !sitemapFile ? 0 : sitemap.isIndex ? 4 : sitemapMissingFiles.length === 0 ? 4 : sitemapMissingFiles.length <= 2 ? 2 : 0,
      label: 'Sitemap URLs map to files',
      evidence: sitemapFile
        ? sitemap.isIndex
          ? 'Sitemap index found; child sitemap URLs are not page URLs in a source audit'
          : sitemapMissingFiles.length
            ? `${sitemapMissingFiles.length} URL(s) without a file, e.g. ${sitemapMissingFiles[0].target}`
            : 'Every sitemap URL has a matching file'
        : 'No sitemap',
      recommendation: sitemap.isIndex
        ? 'Make sure child sitemaps are published with the site.'
        : 'Remove stale sitemap URLs or create the missing files.'
    }),
    scaled('titles_present', totals.missingTitle, 'Every page has a title',
      `${totals.missingTitle} of ${total} without <title>`, 'Add a unique, descriptive title to each page.'),
    scaled('titles_unique', totals.duplicateTitles, 'Titles are unique',
      `${totals.duplicateTitles} duplicate(s)`, 'Make titles distinct across pages.'),
    scaled('descriptions_present', totals.missingDescription, 'Every page has a meta description',
      `${totals.missingDescription} of ${total} without description`, 'Add a useful meta description to each indexable page.'),
    scaled('descriptions_unique', totals.duplicateDescriptions, 'Descriptions are unique',
      `${totals.duplicateDescriptions} duplicate(s)`, 'Avoid repeated descriptions.'),
    scaled('h1_present', totals.missingH1, 'Every page has an H1',
      `${totals.missingH1} of ${total} without H1`, 'Add one main H1 per page.'),
    scaled('lang_declared', totals.missingLang, 'Language is declared on <html>',
      `${totals.missingLang} of ${total} without lang`, 'Declare lang on the <html> tag for each page.'),
    scaled('viewport_present', totals.missingViewport, 'Mobile viewport is configured',
      `${totals.missingViewport} of ${total} without viewport`, 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.'),
    scaled('image_alt', totals.imagesMissingAlt, 'Images have alt text',
      `${totals.imagesMissingAlt} image(s) without alt`, 'Add descriptive alt text to informative images.'),
    scaled('thin_content', totals.thinContent, 'Pages have enough content',
      `${totals.thinContent} of ${total} with fewer than 120 words`, 'Expand thin pages or mark them noindex if they should not rank.'),
    scaled('canonical_present', totals.missingCanonical, 'Canonical is defined',
      `${totals.missingCanonical} of ${total} without canonical`, 'Add an absolute link rel="canonical" for each page.'),
    makeSourceCheck({
      id: 'noindex_review',
      points: totals.noindex === 0 ? 3 : 1,
      label: 'No unexpected noindex tags',
      evidence: `${totals.noindex} page(s) with noindex`,
      recommendation: 'Confirm every noindex is intentional before publishing.'
    }),
    makeSourceCheck({
      id: 'no_meta_refresh',
      points: totals.metaRefresh === 0 ? 2 : 0,
      label: 'No meta refresh redirects',
      evidence: `${totals.metaRefresh} page(s) with meta refresh`,
      recommendation: 'Replace meta refresh with server-side 301 redirects or normal links.'
    }),
    makeSourceCheck({
      id: 'structured_data_home',
      points: jsonLdUseful ? 4 : 0,
      label: 'Structured data on the home page',
      evidence: home?.jsonLdTypes?.length ? home.jsonLdTypes.join(', ') : 'No JSON-LD on the home page',
      recommendation: 'Add Organization or WebSite JSON-LD to the home page.'
    }),
    makeSourceCheck({
      id: 'open_graph_home',
      points: home?.hasOpenGraph ? 3 : 0,
      label: 'Open Graph on the home page',
      evidence: home?.hasOpenGraph ? 'Open Graph found' : 'Missing og:* metadata on the home page',
      recommendation: 'Add og:title, og:description, and og:image to the home page.'
    }),
    makeSourceCheck({
      id: 'favicon_home',
      points: home?.favicon ? 2 : 0,
      label: 'Favicon linked on the home page',
      evidence: home?.favicon || 'No favicon found',
      recommendation: 'Link a favicon with <link rel="icon">.'
    }),
    makeSourceCheck({
      id: 'legal_pages',
      points: hasLegal ? 4 : 0,
      label: 'Legal pages are present',
      evidence: hasLegal ? 'Legal files found' : 'No privacy, cookie, or legal pages found',
      recommendation: 'Add privacy, cookie, and legal pages before publishing.'
    }),
    makeSourceCheck({
      id: 'contact_page',
      points: hasContact ? 2 : 0,
      label: 'Contact or about page',
      evidence: hasContact ? 'Found' : 'Not found',
      recommendation: 'Add a contact page with real details.'
    }),
    scaled('mixed_content', totals.mixedContent, 'No HTTP resources on HTTPS pages',
      `${totals.mixedContent} http:// resource(s) found`, 'Serve every resource over HTTPS or with relative URLs.'),
    scaled('broken_links', totals.brokenInternalLinks, 'Internal links point to existing files',
      brokenLinks.length ? `${brokenLinks.length} broken link(s), e.g. ${brokenLinks[0].file} -> ${brokenLinks[0].target}` : '0 broken links',
      'Fix internal links that point to routes without matching files.'),
    scaled('orphan_pages', totals.orphanPages, 'No orphan pages',
      orphanPages.length ? `${orphanPages.length} page(s) without links or sitemap entries, e.g. ${orphanPages[0]}` : '0 orphan pages',
      'Link orphan pages from navigation or content, add them to the sitemap, or remove them if they should not be published.')
  ];
}

function makeSourceCheck({ id, points, label, evidence, recommendation }) {
  const definition = SOURCE_CHECKS.find((item) => item.id === id);
  if (!definition) throw new Error(`Unknown check: ${id}`);
  const normalizedPoints = Math.max(0, Math.min(definition.max, points));
  return {
    id,
    category: definition.category,
    label,
    status: normalizedPoints >= definition.max ? 'pass' : normalizedPoints > 0 ? 'warn' : 'fail',
    points: normalizedPoints,
    max: definition.max,
    evidence,
    recommendation
  };
}

function buildSourceFixPrompt(result) {
  const issues = result.priority.slice(0, 12)
    .map((check, index) => `${index + 1}. [${check.category}] ${check.label}: ${check.recommendation} Evidence: ${check.evidence}`)
    .join('\n');
  const worstPages = result.pages
    .filter((page) => !page.title || !page.description || page.h1Count === 0 || page.wordCount < 120)
    .slice(0, 10)
    .map((page) => `- ${page.file}${!page.title ? ' (missing title)' : ''}${!page.description ? ' (missing description)' : ''}${page.h1Count === 0 ? ' (missing H1)' : ''}${page.wordCount < 120 ? ' (thin content)' : ''}`)
    .join('\n');

  return [
    "Fix the project technical SEO by editing the listed files directly.",
    '',
    `Audited directory: ${result.dir}`,
    `interseo source score: ${result.score}/100 (${result.grade.label})`,
    `HTML pages: ${result.totals.pages}`,
    '',
    'Priority issues:',
    issues || 'No priority issues.',
    '',
    worstPages ? `Files with the most gaps:\n${worstPages}\n` : '',
    "Apply changes in the source files, keep the project style, and do not invent legal content: use templates and mark real details to complete.",
    ''
  ].filter(Boolean).join('\n');
}

function buildSourceMarkdown(result) {
  const lines = [
    '# interseo Source Report',
    '',
    `Directory: ${result.dir}`,
    `Base URL: ${result.baseUrl}`,
    `Date: ${result.auditedAt}`,
    `Score: ${result.score}/100 (${result.grade.label})`,
    `HTML pages: ${result.totals.pages}`,
    '',
    '## Priority',
    ''
  ];

  for (const check of result.priority.slice(0, 15)) {
    lines.push(`- [${check.category}] ${check.label}: ${check.recommendation} (${check.evidence})`);
  }

  lines.push('', '## Categories', '');
  for (const category of result.categories) {
    lines.push(`- ${category.name}: ${category.percent}% (${category.score}/${category.max})`);
  }

  lines.push('', '## Totals', '');
  const totals = result.totals;
  lines.push(`- Missing title: ${totals.missingTitle}`);
  lines.push(`- Missing description: ${totals.missingDescription}`);
  lines.push(`- Missing H1: ${totals.missingH1}`);
  lines.push(`- Duplicate titles: ${totals.duplicateTitles}`);
  lines.push(`- Thin content: ${totals.thinContent}`);
  lines.push(`- Images without alt: ${totals.imagesMissingAlt}`);
  lines.push(`- Broken internal links: ${totals.brokenInternalLinks}`);
  lines.push(`- Sitemap URLs without files: ${totals.sitemapMissingFiles}`);
  lines.push(`- Pages with meta refresh: ${totals.metaRefresh}`);
  lines.push(`- Orphan pages: ${totals.orphanPages}`);

  if (result.orphanPages.length) {
    lines.push('', '## Orphan Pages', '');
    for (const file of result.orphanPages.slice(0, 20)) {
      lines.push(`- ${file}`);
    }
  }

  if (result.sitemapMissingFiles.length) {
    lines.push('', '## Sitemap URLs Without Files', '');
    for (const item of result.sitemapMissingFiles.slice(0, 20)) {
      lines.push(`- ${item.url}`);
    }
  }

  if (result.brokenLinks.length) {
    lines.push('', '## Broken Links', '');
    for (const link of result.brokenLinks.slice(0, 20)) {
      lines.push(`- ${link.file}: ${link.href} -> ${link.target}`);
    }
  }

  lines.push('', cleanText('The repair prompt is available in fixPrompt and lists the files to edit.'), '');
  return lines.join('\n');
}
