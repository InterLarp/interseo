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
  { id: 'pages_found', category: 'Rastreo', max: 6 },
  { id: 'robots_txt', category: 'Rastreo', max: 4 },
  { id: 'robots_not_blocking', category: 'Rastreo', max: 4 },
  { id: 'sitemap_file', category: 'Rastreo', max: 6 },
  { id: 'titles_present', category: 'Contenido', max: 5 },
  { id: 'titles_unique', category: 'Contenido', max: 4 },
  { id: 'descriptions_present', category: 'Contenido', max: 5 },
  { id: 'descriptions_unique', category: 'Contenido', max: 3 },
  { id: 'h1_present', category: 'Contenido', max: 4 },
  { id: 'lang_declared', category: 'Contenido', max: 3 },
  { id: 'viewport_present', category: 'Contenido', max: 3 },
  { id: 'image_alt', category: 'Contenido', max: 3 },
  { id: 'thin_content', category: 'Contenido', max: 3 },
  { id: 'canonical_present', category: 'Indexacion', max: 3 },
  { id: 'noindex_review', category: 'Indexacion', max: 3 },
  { id: 'structured_data_home', category: 'Indexacion', max: 4 },
  { id: 'open_graph_home', category: 'Indexacion', max: 3 },
  { id: 'favicon_home', category: 'Indexacion', max: 2 },
  { id: 'legal_pages', category: 'Confianza', max: 4 },
  { id: 'contact_page', category: 'Confianza', max: 2 },
  { id: 'mixed_content', category: 'Confianza', max: 3 },
  { id: 'broken_links', category: 'Enlaces', max: 6 }
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

  const brokenLinks = findBrokenLinks(pages, fileSet, baseUrl);
  const totals = buildTotals(pages, brokenLinks);
  const checks = buildSourceChecks({
    pages,
    home,
    totals,
    brokenLinks,
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
    pages: pages.map(({ links, ...page }) => page),
    robots: { exists: fileSet.has('robots.txt'), blocksAll: robots.blocksAll, sitemaps: robots.sitemaps },
    sitemap: { file: sitemapFile, isSitemap: sitemap.isSitemap, urlCount: sitemap.urls.length }
  };

  result.fixPrompt = buildSourceFixPrompt(result);
  result.report = buildSourceMarkdown(result);
  return result;
}

async function walkFiles(rootDir, current = '', collected = []) {
  if (collected.length >= MAX_FILES) return collected;
  const entries = await readdir(path.join(rootDir, current), { withFileTypes: true }).catch((error) => {
    if (!current) throw new Error(`No se puede leer el directorio: ${rootDir} (${error.code || error.message})`);
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

function pathExistsInSource(pathname, fileSet) {
  const clean = pathname.replace(/^\/+/, '').replace(/\/+$/, '').toLowerCase();
  if (!clean) return fileSet.has('index.html') || fileSet.has('index.htm');
  const candidates = [
    clean,
    `${clean}/index.html`,
    `${clean}/index.htm`,
    `${clean}.html`,
    `${clean}.htm`
  ];
  return candidates.some((candidate) => fileSet.has(candidate));
}

function buildTotals(pages, brokenLinks) {
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
    thinContent: pages.filter((page) => page.wordCount < 120).length,
    imagesMissingAlt: pages.reduce((sum, page) => sum + page.imagesMissingAlt, 0),
    mixedContent: pages.reduce((sum, page) => sum + page.mixedContent, 0),
    duplicateTitles: findDuplicates(pages.map((page) => page.title).filter(Boolean)).reduce((sum, item) => sum + item.count, 0),
    duplicateDescriptions: findDuplicates(pages.map((page) => page.description).filter(Boolean)).reduce((sum, item) => sum + item.count, 0),
    brokenInternalLinks: brokenLinks.length
  };
}

function buildSourceChecks({ pages, home, totals, brokenLinks, hasRobots, robots, sitemapFile, sitemap, files }) {
  const total = pages.length || 1;
  const legalPattern = /(privacidad|privacy|cookies|aviso-?legal|terminos|terms|legal)/i;
  const contactPattern = /(contacto|contact|about|sobre-?nosotros|quienes-?somos)/i;
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
      label: 'Paginas HTML encontradas',
      evidence: `${pages.length} pagina(s) HTML analizadas`,
      recommendation: 'Asegurate de auditar la carpeta que contiene el HTML final (por ejemplo dist/ o public/).'
    }),
    makeSourceCheck({
      id: 'robots_txt',
      points: hasRobots ? 4 : 0,
      label: 'robots.txt presente en el proyecto',
      evidence: hasRobots ? 'robots.txt encontrado' : 'No hay robots.txt en la raiz',
      recommendation: 'Anade un robots.txt en la raiz publicable con la directiva Sitemap.'
    }),
    makeSourceCheck({
      id: 'robots_not_blocking',
      points: robots.blocksAll ? 0 : 4,
      label: 'robots.txt no bloquea todo el sitio',
      evidence: robots.blocksAll ? 'Disallow: / detectado para *' : 'Sin bloqueo global',
      recommendation: 'Evita Disallow: / global salvo en entornos que no deban indexarse.'
    }),
    makeSourceCheck({
      id: 'sitemap_file',
      points: sitemapFile && sitemap.isSitemap ? 6 : sitemapFile ? 2 : 0,
      label: 'sitemap.xml presente y valido',
      evidence: sitemapFile ? `${sitemapFile} con ${sitemap.urls.length} URL(s)` : 'No hay sitemap*.xml',
      recommendation: 'Genera un sitemap.xml con las URLs finales del sitio.'
    }),
    scaled('titles_present', totals.missingTitle, 'Todas las paginas tienen title',
      `${totals.missingTitle} de ${total} sin <title>`, 'Anade un title unico y descriptivo a cada pagina.'),
    scaled('titles_unique', totals.duplicateTitles, 'Titles sin duplicados',
      `${totals.duplicateTitles} duplicado(s)`, 'Diferencia los titles de paginas distintas.'),
    scaled('descriptions_present', totals.missingDescription, 'Todas las paginas tienen meta description',
      `${totals.missingDescription} de ${total} sin description`, 'Anade meta description util a cada pagina indexable.'),
    scaled('descriptions_unique', totals.duplicateDescriptions, 'Descriptions sin duplicados',
      `${totals.duplicateDescriptions} duplicado(s)`, 'Evita descriptions repetidas.'),
    scaled('h1_present', totals.missingH1, 'Todas las paginas tienen H1',
      `${totals.missingH1} de ${total} sin H1`, 'Incluye un H1 principal por pagina.'),
    scaled('lang_declared', totals.missingLang, 'Idioma declarado en <html>',
      `${totals.missingLang} de ${total} sin lang`, 'Declara lang en la etiqueta <html> de cada pagina.'),
    scaled('viewport_present', totals.missingViewport, 'Viewport movil configurado',
      `${totals.missingViewport} de ${total} sin viewport`, 'Anade <meta name="viewport" content="width=device-width, initial-scale=1">.'),
    scaled('image_alt', totals.imagesMissingAlt, 'Imagenes con texto alternativo',
      `${totals.imagesMissingAlt} imagen(es) sin alt`, 'Anade alt descriptivo a las imagenes informativas.'),
    scaled('thin_content', totals.thinContent, 'Paginas con contenido suficiente',
      `${totals.thinContent} de ${total} con menos de 120 palabras`, 'Amplia el contenido de las paginas delgadas o marca noindex si no deben rankear.'),
    scaled('canonical_present', totals.missingCanonical, 'Canonical definido',
      `${totals.missingCanonical} de ${total} sin canonical`, 'Anade link rel="canonical" absoluto por pagina.'),
    makeSourceCheck({
      id: 'noindex_review',
      points: totals.noindex === 0 ? 3 : 1,
      label: 'Sin noindex inesperados',
      evidence: `${totals.noindex} pagina(s) con noindex`,
      recommendation: 'Verifica que cada noindex sea intencional antes de publicar.'
    }),
    makeSourceCheck({
      id: 'structured_data_home',
      points: jsonLdUseful ? 4 : 0,
      label: 'Datos estructurados en la home',
      evidence: home?.jsonLdTypes?.length ? home.jsonLdTypes.join(', ') : 'Sin JSON-LD en la home',
      recommendation: 'Incluye JSON-LD de Organization o WebSite en la home.'
    }),
    makeSourceCheck({
      id: 'open_graph_home',
      points: home?.hasOpenGraph ? 3 : 0,
      label: 'Open Graph en la home',
      evidence: home?.hasOpenGraph ? 'Open Graph detectado' : 'Faltan metadatos og:* en la home',
      recommendation: 'Anade og:title, og:description y og:image a la home.'
    }),
    makeSourceCheck({
      id: 'favicon_home',
      points: home?.favicon ? 2 : 0,
      label: 'Favicon enlazado en la home',
      evidence: home?.favicon || 'Sin favicon detectado',
      recommendation: 'Enlaza un favicon con <link rel="icon">.'
    }),
    makeSourceCheck({
      id: 'legal_pages',
      points: hasLegal ? 4 : 0,
      label: 'Paginas legales presentes',
      evidence: hasLegal ? 'Archivos legales detectados' : 'Sin privacidad/cookies/aviso legal',
      recommendation: 'Anade politica de privacidad, cookies y aviso legal antes de publicar.'
    }),
    makeSourceCheck({
      id: 'contact_page',
      points: hasContact ? 2 : 0,
      label: 'Pagina de contacto o sobre nosotros',
      evidence: hasContact ? 'Detectada' : 'No detectada',
      recommendation: 'Incluye una pagina de contacto con datos reales.'
    }),
    scaled('mixed_content', totals.mixedContent, 'Sin recursos HTTP en paginas HTTPS',
      `${totals.mixedContent} recurso(s) http:// detectados`, 'Sirve todos los recursos por HTTPS o con rutas relativas.'),
    scaled('broken_links', totals.brokenInternalLinks, 'Enlaces internos apuntan a archivos existentes',
      brokenLinks.length ? `${brokenLinks.length} enlace(s) rotos, ej: ${brokenLinks[0].file} -> ${brokenLinks[0].target}` : '0 enlaces rotos',
      'Corrige los enlaces internos que apuntan a rutas sin archivo correspondiente.')
  ];
}

function makeSourceCheck({ id, points, label, evidence, recommendation }) {
  const definition = SOURCE_CHECKS.find((item) => item.id === id);
  if (!definition) throw new Error(`Check desconocido: ${id}`);
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
    .map((check, index) => `${index + 1}. [${check.category}] ${check.label}: ${check.recommendation} Evidencia: ${check.evidence}`)
    .join('\n');
  const worstPages = result.pages
    .filter((page) => !page.title || !page.description || page.h1Count === 0 || page.wordCount < 120)
    .slice(0, 10)
    .map((page) => `- ${page.file}${!page.title ? ' (sin title)' : ''}${!page.description ? ' (sin description)' : ''}${page.h1Count === 0 ? ' (sin H1)' : ''}${page.wordCount < 120 ? ' (thin content)' : ''}`)
    .join('\n');

  return [
    'Arregla el SEO tecnico de este proyecto editando directamente los archivos indicados.',
    '',
    `Directorio auditado: ${result.dir}`,
    `Puntuacion interseo (source): ${result.score}/100 (${result.grade.label})`,
    `Paginas HTML: ${result.totals.pages}`,
    '',
    'Problemas priorizados:',
    issues || 'No hay problemas priorizados.',
    '',
    worstPages ? `Archivos con mas carencias:\n${worstPages}\n` : '',
    'Aplica los cambios en los archivos fuente, mantiene el estilo del proyecto y no inventes contenido legal: usa plantillas orientativas y marca los datos a completar.',
    ''
  ].filter(Boolean).join('\n');
}

function buildSourceMarkdown(result) {
  const lines = [
    '# Informe interseo (source)',
    '',
    `Directorio: ${result.dir}`,
    `Base URL: ${result.baseUrl}`,
    `Fecha: ${result.auditedAt}`,
    `Puntuacion: ${result.score}/100 (${result.grade.label})`,
    `Paginas HTML: ${result.totals.pages}`,
    '',
    '## Prioridad',
    ''
  ];

  for (const check of result.priority.slice(0, 15)) {
    lines.push(`- [${check.category}] ${check.label}: ${check.recommendation} (${check.evidence})`);
  }

  lines.push('', '## Categorias', '');
  for (const category of result.categories) {
    lines.push(`- ${category.name}: ${category.percent}% (${category.score}/${category.max})`);
  }

  lines.push('', '## Totales', '');
  const totals = result.totals;
  lines.push(`- Sin title: ${totals.missingTitle}`);
  lines.push(`- Sin description: ${totals.missingDescription}`);
  lines.push(`- Sin H1: ${totals.missingH1}`);
  lines.push(`- Titles duplicados: ${totals.duplicateTitles}`);
  lines.push(`- Thin content: ${totals.thinContent}`);
  lines.push(`- Imagenes sin alt: ${totals.imagesMissingAlt}`);
  lines.push(`- Enlaces internos rotos: ${totals.brokenInternalLinks}`);

  if (result.brokenLinks.length) {
    lines.push('', '## Enlaces rotos', '');
    for (const link of result.brokenLinks.slice(0, 20)) {
      lines.push(`- ${link.file}: ${link.href} -> ${link.target}`);
    }
  }

  lines.push('', cleanText('El prompt de arreglo esta en fixPrompt e indica archivos concretos a editar.'), '');
  return lines.join('\n');
}
