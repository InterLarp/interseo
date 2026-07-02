import { URL } from 'node:url';

const USER_AGENT = 'interseo-auditor/1.0';
const DEFAULT_TIMEOUT_MS = 12000;
const PROBE_TIMEOUT_MS = 5500;
const MAX_RESPONSE_BYTES = 2_000_000;

const DEFAULT_POLICY_PATHS = {
  privacy: [
    '/privacy',
    '/privacy-policy',
    '/politica-privacidad',
    '/politica-de-privacidad',
    '/privacidad',
    '/proteccion-de-datos'
  ],
  cookies: [
    '/cookies',
    '/cookie-policy',
    '/politica-cookies',
    '/politica-de-cookies'
  ],
  terms: [
    '/terms',
    '/terms-of-service',
    '/terminos',
    '/terminos-y-condiciones',
    '/condiciones',
    '/aviso-legal',
    '/legal'
  ],
  contact: [
    '/contact',
    '/contacto',
    '/about',
    '/sobre-nosotros',
    '/quienes-somos'
  ]
};

const CHECK_DEFINITIONS = [
  { id: 'homepage_accessible', category: 'Rastreo', max: 8 },
  { id: 'https', category: 'Rastreo', max: 5 },
  { id: 'robots_not_blocking', category: 'Rastreo', max: 6 },
  { id: 'sitemap_found', category: 'Rastreo', max: 8 },
  { id: 'sitemap_in_robots', category: 'Rastreo', max: 4 },
  { id: 'canonical', category: 'Rastreo', max: 4 },
  { id: 'title', category: 'Contenido', max: 5 },
  { id: 'meta_description', category: 'Contenido', max: 5 },
  { id: 'viewport', category: 'Contenido', max: 3 },
  { id: 'html_lang', category: 'Contenido', max: 3 },
  { id: 'h1', category: 'Contenido', max: 4 },
  { id: 'internal_links', category: 'Contenido', max: 3 },
  { id: 'image_alt', category: 'Contenido', max: 2 },
  { id: 'noindex_absent', category: 'Indexacion', max: 5 },
  { id: 'structured_data', category: 'Indexacion', max: 5 },
  { id: 'open_graph', category: 'Indexacion', max: 4 },
  { id: 'favicon', category: 'Indexacion', max: 2 },
  { id: 'html_content_type', category: 'Indexacion', max: 2 },
  { id: 'body_content', category: 'Indexacion', max: 2 },
  { id: 'privacy_policy', category: 'Confianza', max: 4 },
  { id: 'cookie_policy', category: 'Confianza', max: 3 },
  { id: 'terms_or_legal', category: 'Confianza', max: 3 },
  { id: 'contact_or_about', category: 'Confianza', max: 2 },
  { id: 'sitemap_has_home', category: 'Google', max: 3 },
  { id: 'jsonld_useful_type', category: 'Google', max: 3 },
  { id: 'google_ready_core', category: 'Google', max: 2 }
];

const MAX_SCORE = CHECK_DEFINITIONS.reduce((sum, check) => sum + check.max, 0);

export function normalizeUrl(input) {
  const raw = String(input || '').trim();
  if (!raw) {
    throw new Error('Introduce una URL.');
  }

  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const url = new URL(withProtocol);

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('La URL debe usar http o https.');
  }

  url.hash = '';
  return url;
}

export async function fetchText(url, options = {}) {
  const controller = new AbortController();
  const startedAt = Date.now();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'accept': options.accept || 'text/html,application/xhtml+xml,application/xml,text/plain;q=0.9,*/*;q=0.8',
        'user-agent': USER_AGENT
      }
    });

    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > MAX_RESPONSE_BYTES) {
      return {
        url,
        finalUrl: response.url,
        ok: false,
        status: response.status,
        statusText: response.statusText,
        headers: headersToObject(response.headers),
        text: '',
        elapsedMs: Date.now() - startedAt,
        error: `Respuesta demasiado grande (${contentLength} bytes).`
      };
    }

    const buffer = await response.arrayBuffer();
    const text = new TextDecoder('utf-8').decode(buffer.slice(0, MAX_RESPONSE_BYTES));

    return {
      url,
      finalUrl: response.url,
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      headers: headersToObject(response.headers),
      text,
      elapsedMs: Date.now() - startedAt
    };
  } catch (error) {
    return {
      url,
      finalUrl: url,
      ok: false,
      status: 0,
      statusText: '',
      headers: {},
      text: '',
      elapsedMs: Date.now() - startedAt,
      error: error.name === 'AbortError' ? 'Tiempo de espera agotado.' : error.message
    };
  } finally {
    clearTimeout(timeout);
  }
}

function headersToObject(headers) {
  const out = {};
  for (const [key, value] of headers.entries()) {
    out[key.toLowerCase()] = value;
  }
  return out;
}

export async function auditSite(input) {
  const targetUrl = normalizeUrl(input.url || input);
  const startedAt = Date.now();
  const homepage = await fetchText(targetUrl.href);
  const html = homepage.text || '';
  const page = homepage.ok ? analyzeHtml(html, homepage.finalUrl || targetUrl.href) : emptyPageAnalysis(targetUrl.href);

  const origin = new URL(page.url || targetUrl.href).origin;
  const robotsUrl = new URL('/robots.txt', origin).href;
  const robotsResponse = await fetchText(robotsUrl, {
    timeoutMs: PROBE_TIMEOUT_MS,
    accept: 'text/plain,*/*;q=0.8'
  });
  const robots = parseRobotsTxt(robotsResponse.ok ? robotsResponse.text : '');

  const [sitemap, policies] = await Promise.all([
    auditSitemap(origin, robots.sitemaps, targetUrl.href),
    auditPolicies(origin, page.links)
  ]);

  const checks = buildChecks({
    targetUrl,
    homepage,
    page,
    robotsResponse,
    robots,
    sitemap,
    policies
  });

  const score = checks.reduce((sum, check) => sum + check.points, 0);
  const categories = summarizeCategories(checks);
  const discoveredUrls = collectDiscoveredUrls(targetUrl.href, page, sitemap, policies);
  const kit = buildGeneratedKit({
    url: targetUrl.href,
    siteName: input.siteName || page.title || targetUrl.hostname,
    description: input.description || page.description || '',
    businessName: input.businessName || input.siteName || page.title || targetUrl.hostname,
    contactEmail: input.contactEmail || '',
    discoveredUrls
  });

  return {
    auditedAt: new Date().toISOString(),
    elapsedMs: Date.now() - startedAt,
    inputUrl: targetUrl.href,
    finalUrl: homepage.finalUrl || targetUrl.href,
    score,
    maxScore: MAX_SCORE,
    grade: scoreToGrade(score),
    categories,
    checks,
    priority: checks
      .filter((check) => check.status !== 'pass')
      .sort((a, b) => (b.max - b.points) - (a.max - a.points)),
    page,
    robots: {
      url: robotsUrl,
      status: robotsResponse.status,
      exists: robotsResponse.ok,
      error: robotsResponse.error || null,
      sitemaps: robots.sitemaps,
      blocksAll: robots.blocksAll
    },
    sitemap,
    policies,
    kit
  };
}

function emptyPageAnalysis(url) {
  return {
    url,
    title: '',
    titleLength: 0,
    description: '',
    descriptionLength: 0,
    canonical: '',
    viewport: '',
    lang: '',
    robotsMeta: '',
    noindex: false,
    h1: [],
    h2Count: 0,
    wordCount: 0,
    links: [],
    internalLinks: [],
    externalLinks: [],
    images: [],
    imagesMissingAlt: [],
    jsonLdTypes: [],
    hasStructuredData: false,
    openGraph: {},
    hasOpenGraph: false,
    favicon: ''
  };
}

export function analyzeHtml(html, pageUrl) {
  const title = cleanText(firstMatch(html, /<title\b[^>]*>([\s\S]*?)<\/title>/i));
  const description = cleanText(findMetaContent(html, 'name', 'description'));
  const robotsMeta = cleanText(findMetaContent(html, 'name', 'robots'));
  const viewport = cleanText(findMetaContent(html, 'name', 'viewport'));
  const canonical = findLinkHref(html, 'canonical');
  const favicon = findFavicon(html);
  const lang = cleanText(firstMatch(html, /<html\b[^>]*\blang\s*=\s*["']?([^"'\s>]+)/i));
  const h1 = extractHeadings(html, 1);
  const h2 = extractHeadings(html, 2);
  const links = extractLinks(html, pageUrl);
  const internalLinks = links.filter((link) => link.sameOrigin);
  const externalLinks = links.filter((link) => !link.sameOrigin);
  const images = extractImages(html, pageUrl);
  const imagesMissingAlt = images.filter((image) => !image.alt && !image.decorative);
  const jsonLdTypes = extractJsonLdTypes(html);
  const openGraph = {
    title: findMetaContent(html, 'property', 'og:title'),
    description: findMetaContent(html, 'property', 'og:description'),
    image: findMetaContent(html, 'property', 'og:image'),
    type: findMetaContent(html, 'property', 'og:type')
  };

  return {
    url: pageUrl,
    title,
    titleLength: title.length,
    description,
    descriptionLength: description.length,
    canonical,
    viewport,
    lang,
    robotsMeta,
    noindex: /\bnoindex\b/i.test(robotsMeta),
    h1,
    h2Count: h2.length,
    wordCount: countWords(stripScriptsAndStyles(html)),
    links,
    internalLinks,
    externalLinks,
    images,
    imagesMissingAlt,
    jsonLdTypes,
    hasStructuredData: jsonLdTypes.length > 0,
    openGraph,
    hasOpenGraph: Object.values(openGraph).filter(Boolean).length >= 2,
    favicon
  };
}

export function parseRobotsTxt(text) {
  const sitemaps = [];
  const groups = [];
  let current = null;

  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, '').trim();
    if (!line || !line.includes(':')) continue;

    const separator = line.indexOf(':');
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (key === 'sitemap' && value) {
      sitemaps.push(value);
      continue;
    }

    if (key === 'user-agent') {
      if (!current || current.rules.length > 0) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      continue;
    }

    if (current && (key === 'allow' || key === 'disallow')) {
      current.rules.push({ directive: key, value });
    }
  }

  const relevantGroups = groups.filter((group) =>
    group.agents.includes('*') || group.agents.some((agent) => agent.includes('googlebot'))
  );

  const blocksAll = relevantGroups.some((group) => {
    const disallowsRoot = group.rules.some((rule) => rule.directive === 'disallow' && rule.value.trim() === '/');
    const allowsRoot = group.rules.some((rule) => rule.directive === 'allow' && ['', '/'].includes(rule.value.trim()));
    return disallowsRoot && !allowsRoot;
  });

  return {
    sitemaps: [...new Set(sitemaps)],
    groups,
    blocksAll
  };
}

async function auditSitemap(origin, robotsSitemaps, homepageUrl) {
  const candidateUrls = [
    ...robotsSitemaps,
    new URL('/sitemap.xml', origin).href,
    new URL('/sitemap_index.xml', origin).href,
    new URL('/sitemap-index.xml', origin).href
  ];

  const uniqueCandidates = [...new Set(candidateUrls.filter(Boolean))].slice(0, 8);
  const responses = await Promise.all(uniqueCandidates.map(async (url) => {
    const response = await fetchText(url, {
      timeoutMs: PROBE_TIMEOUT_MS,
      accept: 'application/xml,text/xml,text/plain,*/*;q=0.8'
    });
    const parsed = parseSitemap(response.text || '');
    return {
      url,
      status: response.status,
      ok: response.ok,
      error: response.error || null,
      isSitemap: response.ok && parsed.isSitemap,
      urlCount: parsed.urls.length,
      urls: parsed.urls.slice(0, 250)
    };
  }));

  const best = responses.find((item) => item.isSitemap) || null;
  const normalizedHome = normalizeComparableUrl(homepageUrl);
  const includesHomepage = best
    ? best.urls.some((url) => normalizeComparableUrl(url) === normalizedHome || normalizeComparableUrl(url) === normalizeComparableUrl(origin))
    : false;

  return {
    found: Boolean(best),
    url: best?.url || '',
    status: best?.status || 0,
    fromRobots: best ? robotsSitemaps.includes(best.url) : false,
    urlCount: best?.urlCount || 0,
    includesHomepage,
    sampledUrls: best?.urls.slice(0, 25) || [],
    candidates: responses.map(({ urls, ...rest }) => rest)
  };
}

export function parseSitemap(text) {
  const body = String(text || '');
  const isSitemap = /<(urlset|sitemapindex)\b/i.test(body);
  const urls = [...body.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)]
    .map((match) => decodeHtml(match[1].trim()))
    .filter(Boolean);
  return { isSitemap, urls };
}

async function auditPolicies(origin, links) {
  const linked = findPolicyLinks(links);
  const results = {};

  await Promise.all(Object.entries(DEFAULT_POLICY_PATHS).map(async ([type, paths]) => {
    if (linked[type]) {
      results[type] = {
        found: true,
        source: 'link',
        url: linked[type].url,
        text: linked[type].text || linked[type].url
      };
      return;
    }

    const probes = await Promise.all(paths.map(async (pathname) => {
      const url = new URL(pathname, origin).href;
      const response = await fetchText(url, {
        timeoutMs: PROBE_TIMEOUT_MS,
        accept: 'text/html,*/*;q=0.8'
      });
      return {
        url,
        status: response.status,
        ok: response.ok,
        contentType: response.headers['content-type'] || '',
        error: response.error || null
      };
    }));

    const found = probes.find((probe) => probe.ok && /^2\d\d$/.test(String(probe.status)));
    results[type] = found
      ? { found: true, source: 'probe', url: found.url, text: found.url, probes }
      : { found: false, source: 'none', url: '', text: '', probes };
  }));

  return results;
}

function findPolicyLinks(links) {
  const patterns = {
    privacy: /\b(privacidad|privacy|politica[-\s]*de[-\s]*privacidad|proteccion[-\s]*de[-\s]*datos)\b/i,
    cookies: /\b(cookies?|cookie[-\s]*policy|politica[-\s]*de[-\s]*cookies?)\b/i,
    terms: /\b(terminos|condiciones|terms|terms[-\s]*of[-\s]*service|legal|aviso[-\s]*legal)\b/i,
    contact: /\b(contacto|contact|about|quienes[-\s]*somos|sobre[-\s]*nosotros)\b/i
  };

  const found = {};
  for (const link of links || []) {
    const haystack = `${link.text || ''} ${link.url || ''}`.toLowerCase();
    for (const [type, pattern] of Object.entries(patterns)) {
      if (!found[type] && pattern.test(haystack)) {
        found[type] = link;
      }
    }
  }
  return found;
}

export function buildChecks({ targetUrl, homepage, page, robotsResponse, robots, sitemap, policies }) {
  const contentType = homepage.headers?.['content-type'] || '';
  const hasHtmlContentType = /text\/html|application\/xhtml/i.test(contentType);
  const titlePoints = scoreLength(page.titleLength, 10, 65, 5, page.title ? 3 : 0);
  const descriptionPoints = scoreLength(page.descriptionLength, 70, 165, 5, page.description ? 3 : 0);
  const h1Points = page.h1.length === 1 ? 4 : page.h1.length > 1 ? 2 : 0;
  const imageAltPoints = page.images.length === 0 ? 2 : page.imagesMissingAlt.length === 0 ? 2 : page.imagesMissingAlt.length <= Math.ceil(page.images.length * 0.2) ? 1 : 0;
  const jsonLdUseful = page.jsonLdTypes.some((type) =>
    /organization|localbusiness|website|webpage|article|product|softwareapplication|service/i.test(type)
  );
  const coreGoogleReady = homepage.ok && !page.noindex && !robots.blocksAll && sitemap.found;

  return [
    makeCheck({
      id: 'homepage_accessible',
      points: homepage.ok ? 8 : 0,
      label: 'La pagina principal responde correctamente',
      evidence: homepage.ok ? `HTTP ${homepage.status} en ${homepage.elapsedMs} ms` : homepage.error || `HTTP ${homepage.status}`,
      recommendation: 'La home debe devolver HTTP 200 y ser accesible sin login ni bloqueos.'
    }),
    makeCheck({
      id: 'https',
      points: targetUrl.protocol === 'https:' ? 5 : 0,
      label: 'Usa HTTPS',
      evidence: targetUrl.protocol === 'https:' ? targetUrl.origin : targetUrl.href,
      recommendation: 'Configura certificado SSL y redirige todo HTTP a HTTPS.'
    }),
    makeCheck({
      id: 'robots_not_blocking',
      points: robots.blocksAll ? 0 : 6,
      label: 'robots.txt no bloquea Google',
      evidence: robots.blocksAll ? 'Detectado Disallow: / para * o Googlebot' : robotsResponse.ok ? 'Sin bloqueo global detectado' : 'No hay robots.txt, Google puede rastrear por defecto',
      recommendation: 'Evita bloquear la raiz con Disallow: /. Usa noindex para excluir paginas del indice.'
    }),
    makeCheck({
      id: 'sitemap_found',
      points: sitemap.found ? 8 : 0,
      label: 'Sitemap XML disponible',
      evidence: sitemap.found ? `${sitemap.url} con ${sitemap.urlCount} URL(s)` : 'No se encontro sitemap.xml ni sitemap_index.xml',
      recommendation: 'Publica un sitemap XML en /sitemap.xml con las paginas indexables.'
    }),
    makeCheck({
      id: 'sitemap_in_robots',
      points: sitemap.fromRobots ? 4 : sitemap.found ? 2 : 0,
      label: 'robots.txt declara el sitemap',
      evidence: sitemap.fromRobots ? 'Directiva Sitemap encontrada' : sitemap.found ? 'Sitemap existe, pero no esta declarado en robots.txt' : 'Sin sitemap declarado',
      recommendation: 'Anade una linea Sitemap: https://tu-dominio.com/sitemap.xml en robots.txt.'
    }),
    makeCheck({
      id: 'canonical',
      points: page.canonical ? 4 : 0,
      label: 'Canonical definido',
      evidence: page.canonical || 'No hay link rel="canonical"',
      recommendation: 'Incluye una URL canonica absoluta para evitar duplicados.'
    }),
    makeCheck({
      id: 'title',
      points: titlePoints,
      label: 'Title claro y con longitud razonable',
      evidence: page.title ? `${page.titleLength} caracteres: ${page.title}` : 'Falta <title>',
      recommendation: 'Usa un title unico, descriptivo y normalmente entre 10 y 65 caracteres.'
    }),
    makeCheck({
      id: 'meta_description',
      points: descriptionPoints,
      label: 'Meta description preparada para snippet',
      evidence: page.description ? `${page.descriptionLength} caracteres` : 'Falta meta description',
      recommendation: 'Escribe una description unica, util y normalmente entre 70 y 165 caracteres.'
    }),
    makeCheck({
      id: 'viewport',
      points: page.viewport ? 3 : 0,
      label: 'Viewport movil configurado',
      evidence: page.viewport || 'Falta meta viewport',
      recommendation: 'Incluye <meta name="viewport" content="width=device-width, initial-scale=1">.'
    }),
    makeCheck({
      id: 'html_lang',
      points: page.lang ? 3 : 0,
      label: 'Idioma HTML declarado',
      evidence: page.lang || 'Falta atributo lang en <html>',
      recommendation: 'Declara el idioma principal, por ejemplo <html lang="es">.'
    }),
    makeCheck({
      id: 'h1',
      points: h1Points,
      label: 'Jerarquia H1 correcta',
      evidence: page.h1.length === 1 ? page.h1[0] : `${page.h1.length} H1 detectados`,
      recommendation: 'Usa un H1 principal que describa la pagina.'
    }),
    makeCheck({
      id: 'internal_links',
      points: page.internalLinks.length >= 3 ? 3 : page.internalLinks.length > 0 ? 1 : 0,
      label: 'Enlazado interno rastreable',
      evidence: `${page.internalLinks.length} enlaces internos detectados`,
      recommendation: 'Incluye navegacion y enlaces internos hacia paginas importantes.'
    }),
    makeCheck({
      id: 'image_alt',
      points: imageAltPoints,
      label: 'Imagenes con texto alternativo',
      evidence: `${page.imagesMissingAlt.length} de ${page.images.length} imagenes sin alt`,
      recommendation: 'Anade alt descriptivo a imagenes informativas y alt vacio solo a decorativas.'
    }),
    makeCheck({
      id: 'noindex_absent',
      points: page.noindex ? 0 : 5,
      label: 'La home no tiene noindex',
      evidence: page.robotsMeta || 'Sin meta robots restrictiva',
      recommendation: 'Retira noindex de las paginas que quieras posicionar.'
    }),
    makeCheck({
      id: 'structured_data',
      points: page.hasStructuredData ? 5 : 0,
      label: 'Datos estructurados JSON-LD',
      evidence: page.jsonLdTypes.length ? page.jsonLdTypes.join(', ') : 'No se detecto application/ld+json',
      recommendation: 'Incluye JSON-LD de Organization, WebSite, LocalBusiness, Product u otro tipo adecuado.'
    }),
    makeCheck({
      id: 'open_graph',
      points: page.hasOpenGraph ? 4 : Object.values(page.openGraph).some(Boolean) ? 2 : 0,
      label: 'Metadatos sociales Open Graph',
      evidence: page.hasOpenGraph ? 'Open Graph basico detectado' : 'Faltan og:title, og:description u og:image',
      recommendation: 'Anade og:title, og:description, og:type y og:image para compartir mejor.'
    }),
    makeCheck({
      id: 'favicon',
      points: page.favicon ? 2 : 0,
      label: 'Favicon enlazado',
      evidence: page.favicon || 'No se detecto icon/favicon',
      recommendation: 'Publica favicon.ico o enlaza un icono con <link rel="icon">.'
    }),
    makeCheck({
      id: 'html_content_type',
      points: hasHtmlContentType ? 2 : homepage.ok ? 1 : 0,
      label: 'Content-Type HTML correcto',
      evidence: contentType || 'Sin Content-Type',
      recommendation: 'Sirve la home como text/html con charset UTF-8.'
    }),
    makeCheck({
      id: 'body_content',
      points: page.wordCount >= 120 ? 2 : page.wordCount >= 40 ? 1 : 0,
      label: 'Contenido textual suficiente',
      evidence: `${page.wordCount} palabras aproximadas`,
      recommendation: 'Anade contenido util y visible que explique la oferta, ubicacion, servicios o producto.'
    }),
    makeCheck({
      id: 'privacy_policy',
      points: policies.privacy?.found ? 4 : 0,
      label: 'Politica de privacidad encontrada',
      evidence: policies.privacy?.found ? policies.privacy.url : 'No detectada',
      recommendation: 'Publica una pagina de privacidad enlazada desde el footer o navegacion.'
    }),
    makeCheck({
      id: 'cookie_policy',
      points: policies.cookies?.found ? 3 : 0,
      label: 'Politica de cookies encontrada',
      evidence: policies.cookies?.found ? policies.cookies.url : 'No detectada',
      recommendation: 'Publica politica de cookies si usas cookies, analitica, publicidad o trackers.'
    }),
    makeCheck({
      id: 'terms_or_legal',
      points: policies.terms?.found ? 3 : 0,
      label: 'Aviso legal o terminos encontrados',
      evidence: policies.terms?.found ? policies.terms.url : 'No detectado',
      recommendation: 'Anade aviso legal, terminos o condiciones segun el tipo de negocio.'
    }),
    makeCheck({
      id: 'contact_or_about',
      points: policies.contact?.found ? 2 : 0,
      label: 'Contacto o pagina de empresa',
      evidence: policies.contact?.found ? policies.contact.url : 'No detectado',
      recommendation: 'Incluye una pagina de contacto o sobre nosotros con datos reales del negocio.'
    }),
    makeCheck({
      id: 'sitemap_has_home',
      points: sitemap.includesHomepage ? 3 : sitemap.found ? 1 : 0,
      label: 'El sitemap incluye la home',
      evidence: sitemap.includesHomepage ? 'Home encontrada en sitemap' : sitemap.found ? 'Sitemap encontrado sin home clara' : 'Sin sitemap',
      recommendation: 'Incluye la URL canonica de la home en el sitemap.'
    }),
    makeCheck({
      id: 'jsonld_useful_type',
      points: jsonLdUseful ? 3 : page.hasStructuredData ? 1 : 0,
      label: 'JSON-LD con tipo util para Google',
      evidence: page.jsonLdTypes.length ? page.jsonLdTypes.join(', ') : 'No hay tipos detectados',
      recommendation: 'Usa tipos Schema.org relevantes como Organization, WebSite, LocalBusiness, Product o Article.'
    }),
    makeCheck({
      id: 'google_ready_core',
      points: coreGoogleReady ? 2 : 0,
      label: 'Base lista para Search Console',
      evidence: coreGoogleReady ? 'Home, sitemap, indexacion y robots OK' : 'Falta alguna pieza critica',
      recommendation: 'Antes de enviar a Google, valida que la home carga, no hay noindex, robots no bloquea y el sitemap existe.'
    })
  ];
}

function makeCheck({ id, points, label, evidence, recommendation }) {
  const definition = CHECK_DEFINITIONS.find((item) => item.id === id);
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

function scoreLength(length, min, max, fullPoints, partialPoints) {
  if (!length) return 0;
  if (length >= min && length <= max) return fullPoints;
  return partialPoints;
}

function summarizeCategories(checks) {
  const map = new Map();
  for (const check of checks) {
    if (!map.has(check.category)) {
      map.set(check.category, { name: check.category, score: 0, max: 0, pass: 0, warn: 0, fail: 0 });
    }
    const item = map.get(check.category);
    item.score += check.points;
    item.max += check.max;
    item[check.status] += 1;
  }

  return [...map.values()].map((item) => ({
    ...item,
    percent: item.max ? Math.round((item.score / item.max) * 100) : 0
  }));
}

function scoreToGrade(score) {
  const percent = Math.round((score / MAX_SCORE) * 100);
  if (percent >= 90) return { label: 'Excelente', tone: 'good' };
  if (percent >= 75) return { label: 'Bueno', tone: 'good' };
  if (percent >= 60) return { label: 'Mejorable', tone: 'warn' };
  return { label: 'Critico', tone: 'bad' };
}

function collectDiscoveredUrls(homepageUrl, page, sitemap, policies) {
  const urls = new Set([homepageUrl]);
  for (const link of page.internalLinks.slice(0, 80)) {
    urls.add(stripHash(link.url));
  }
  for (const url of sitemap.sampledUrls || []) {
    urls.add(stripHash(url));
  }
  for (const policy of Object.values(policies || {})) {
    if (policy?.found && policy.url) urls.add(stripHash(policy.url));
  }
  return [...urls].slice(0, 120);
}

export function buildGeneratedKit(input) {
  const targetUrl = normalizeUrl(input.url);
  const origin = targetUrl.origin;
  const siteName = cleanText(input.siteName || targetUrl.hostname) || targetUrl.hostname;
  const businessName = cleanText(input.businessName || siteName) || siteName;
  const description = cleanText(input.description || `Sitio web oficial de ${siteName}.`);
  const contactEmail = cleanText(input.contactEmail || 'contacto@tu-dominio.com');
  const today = new Date().toISOString().slice(0, 10);
  const urls = normalizeKitUrls(input.discoveredUrls || [targetUrl.href], origin);
  const sitemapUrl = new URL('/sitemap.xml', origin).href;
  const privacyUrl = new URL('/politica-de-privacidad', origin).href;
  const cookiesUrl = new URL('/politica-de-cookies', origin).href;
  const termsUrl = new URL('/aviso-legal', origin).href;

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: businessName,
    url: origin,
    email: contactEmail.includes('@') ? contactEmail : undefined,
    sameAs: []
  };

  const files = [
    {
      path: 'robots.txt',
      language: 'text',
      content: `User-agent: *\nAllow: /\n\nSitemap: ${sitemapUrl}\n`
    },
    {
      path: 'sitemap.xml',
      language: 'xml',
      content: [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        ...urls.map((url) => [
          '  <url>',
          `    <loc>${escapeXml(url)}</loc>`,
          `    <lastmod>${today}</lastmod>`,
          '    <changefreq>weekly</changefreq>',
          '    <priority>0.8</priority>',
          '  </url>'
        ].join('\n')),
        '</urlset>',
        ''
      ].join('\n')
    },
    {
      path: 'seo-head-snippet.html',
      language: 'html',
      content: [
        `<title>${escapeHtml(siteName)}</title>`,
        `<meta name="description" content="${escapeHtml(description)}">`,
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        `<link rel="canonical" href="${escapeHtml(origin + '/')}">`,
        `<meta property="og:type" content="website">`,
        `<meta property="og:title" content="${escapeHtml(siteName)}">`,
        `<meta property="og:description" content="${escapeHtml(description)}">`,
        `<meta property="og:url" content="${escapeHtml(origin + '/')}">`,
        '<script type="application/ld+json">',
        JSON.stringify(schema, null, 2),
        '</script>',
        ''
      ].join('\n')
    },
    {
      path: 'structured-data.jsonld',
      language: 'json',
      content: `${JSON.stringify(schema, null, 2)}\n`
    },
    {
      path: 'google-search-console-checklist.md',
      language: 'markdown',
      content: [
        `# Checklist Google para ${siteName}`,
        '',
        `- Publica \`robots.txt\` en \`${origin}/robots.txt\`.`,
        `- Publica \`sitemap.xml\` en \`${sitemapUrl}\`.`,
        '- Verifica que la home devuelve HTTP 200, usa HTTPS y no contiene `noindex`.',
        '- Entra en Google Search Console y verifica la propiedad del dominio.',
        '- Abre el informe Sitemaps, pega la URL del sitemap y pulsa Submit.',
        '- Usa la inspeccion de URL para pedir recrawl de la home tras publicar cambios.',
        '- Pasa el Rich Results Test si anades datos estructurados.',
        '- Revisa PageSpeed Insights antes de campanas o lanzamientos importantes.',
        '',
        'Notas:',
        '- Google puede rastrear paginas bien enlazadas sin sitemap, pero el sitemap ayuda a descubrir contenido importante.',
        '- robots.txt gestiona rastreo, no debe usarse como medida de seguridad ni como sustituto de noindex.',
        ''
      ].join('\n')
    },
    {
      path: 'legal/politica-de-privacidad.md',
      language: 'markdown',
      content: buildPrivacyTemplate({ businessName, contactEmail, privacyUrl, today })
    },
    {
      path: 'legal/politica-de-cookies.md',
      language: 'markdown',
      content: buildCookieTemplate({ businessName, contactEmail, cookiesUrl, today })
    },
    {
      path: 'legal/aviso-legal.md',
      language: 'markdown',
      content: buildTermsTemplate({ businessName, contactEmail, termsUrl, today })
    }
  ];

  return {
    siteName,
    origin,
    generatedAt: new Date().toISOString(),
    files
  };
}

function normalizeKitUrls(urls, origin) {
  const normalized = new Set();
  for (const raw of urls) {
    try {
      const url = new URL(raw, origin);
      if (!['http:', 'https:'].includes(url.protocol)) continue;
      if (url.origin !== origin) continue;
      url.hash = '';
      normalized.add(url.href);
    } catch {}
  }

  if (normalized.size === 0) normalized.add(`${origin}/`);
  return [...normalized].sort((a, b) => a.localeCompare(b));
}

function buildPrivacyTemplate({ businessName, contactEmail, privacyUrl, today }) {
  return [
    `# Politica de privacidad de ${businessName}`,
    '',
    `Ultima actualizacion: ${today}`,
    '',
    '> Plantilla orientativa. Revisala con asesoramiento legal antes de publicarla.',
    '',
    `En ${businessName} tratamos los datos personales necesarios para responder consultas, prestar servicios, gestionar comunicaciones y cumplir obligaciones legales.`,
    '',
    '## Responsable',
    '',
    `- Responsable: ${businessName}`,
    `- Contacto: ${contactEmail}`,
    `- URL: ${privacyUrl}`,
    '',
    '## Datos que podemos tratar',
    '',
    '- Datos identificativos y de contacto enviados por formularios o correo.',
    '- Datos tecnicos de navegacion necesarios para seguridad y funcionamiento.',
    '- Datos de analitica o marketing solo cuando exista base legal o consentimiento aplicable.',
    '',
    '## Derechos',
    '',
    'Puedes solicitar acceso, rectificacion, supresion, oposicion, limitacion o portabilidad escribiendo al contacto indicado.',
    ''
  ].join('\n');
}

function buildCookieTemplate({ businessName, contactEmail, cookiesUrl, today }) {
  return [
    `# Politica de cookies de ${businessName}`,
    '',
    `Ultima actualizacion: ${today}`,
    '',
    '> Plantilla orientativa. Ajusta esta pagina a las cookies reales del sitio.',
    '',
    'Este sitio puede usar cookies tecnicas necesarias para su funcionamiento y, si se activan, cookies de analitica, personalizacion o publicidad.',
    '',
    '## Gestion de cookies',
    '',
    'El usuario puede aceptar, rechazar o configurar cookies no necesarias desde el banner o panel de preferencias cuando corresponda.',
    '',
    '## Contacto',
    '',
    `- Responsable: ${businessName}`,
    `- Contacto: ${contactEmail}`,
    `- URL: ${cookiesUrl}`,
    ''
  ].join('\n');
}

function buildTermsTemplate({ businessName, contactEmail, termsUrl, today }) {
  return [
    `# Aviso legal de ${businessName}`,
    '',
    `Ultima actualizacion: ${today}`,
    '',
    '> Plantilla orientativa. Completa datos fiscales, direccion, registro y condiciones reales antes de publicarla.',
    '',
    '## Titular del sitio',
    '',
    `- Titular: ${businessName}`,
    `- Contacto: ${contactEmail}`,
    `- URL: ${termsUrl}`,
    '',
    '## Uso del sitio',
    '',
    'El usuario se compromete a usar el sitio de forma licita y a no realizar acciones que puedan danar, inutilizar o sobrecargar el servicio.',
    '',
    '## Propiedad intelectual',
    '',
    `Los contenidos, marcas y elementos del sitio pertenecen a ${businessName} o a sus respectivos titulares, salvo indicacion contraria.`,
    ''
  ].join('\n');
}

function extractLinks(html, pageUrl) {
  const links = [];
  const base = new URL(pageUrl);

  for (const match of String(html || '').matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const attrs = parseAttributes(match[1]);
    const href = attrs.href || '';
    if (!href || /^(#|mailto:|tel:|javascript:)/i.test(href.trim())) continue;

    try {
      const url = new URL(href, base.href);
      if (!['http:', 'https:'].includes(url.protocol)) continue;
      url.hash = '';
      links.push({
        href,
        url: url.href,
        text: cleanText(match[2]),
        sameOrigin: url.origin === base.origin
      });
    } catch {}
  }

  return links;
}

function extractImages(html, pageUrl) {
  const images = [];
  const base = new URL(pageUrl);

  for (const match of String(html || '').matchAll(/<img\b([^>]*)>/gi)) {
    const attrs = parseAttributes(match[1]);
    let src = attrs.src || attrs['data-src'] || '';
    try {
      src = src ? new URL(src, base.href).href : '';
    } catch {}

    images.push({
      src,
      alt: cleanText(attrs.alt || ''),
      decorative: attrs.role === 'presentation' || attrs['aria-hidden'] === 'true'
    });
  }

  return images;
}

function extractHeadings(html, level) {
  const regex = new RegExp(`<h${level}\\b[^>]*>([\\s\\S]*?)<\\/h${level}>`, 'gi');
  return [...String(html || '').matchAll(regex)]
    .map((match) => cleanText(match[1]))
    .filter(Boolean);
}

function extractJsonLdTypes(html) {
  const types = [];
  for (const match of String(html || '').matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = parseAttributes(match[1]);
    if (!/application\/ld\+json/i.test(attrs.type || '')) continue;

    try {
      const parsed = JSON.parse(decodeHtml(match[2].trim()));
      collectJsonLdTypes(parsed, types);
    } catch {
      types.push('JSON-LD invalido');
    }
  }

  return [...new Set(types.filter(Boolean))];
}

function collectJsonLdTypes(value, types) {
  if (!value) return;
  if (Array.isArray(value)) {
    for (const item of value) collectJsonLdTypes(item, types);
    return;
  }
  if (typeof value === 'object') {
    const type = value['@type'];
    if (Array.isArray(type)) types.push(...type.map(String));
    if (typeof type === 'string') types.push(type);
    if (value['@graph']) collectJsonLdTypes(value['@graph'], types);
  }
}

function findMetaContent(html, attrName, attrValue) {
  for (const tag of findTags(html, 'meta')) {
    const attrs = parseAttributes(tag);
    if ((attrs[attrName] || '').toLowerCase() === attrValue.toLowerCase()) {
      return attrs.content || '';
    }
  }
  return '';
}

function findLinkHref(html, relName) {
  for (const tag of findTags(html, 'link')) {
    const attrs = parseAttributes(tag);
    const rel = (attrs.rel || '').toLowerCase().split(/\s+/);
    if (rel.includes(relName.toLowerCase())) {
      return attrs.href || '';
    }
  }
  return '';
}

function findFavicon(html) {
  for (const tag of findTags(html, 'link')) {
    const attrs = parseAttributes(tag);
    const rel = (attrs.rel || '').toLowerCase();
    if (/\b(icon|shortcut icon|apple-touch-icon)\b/.test(rel)) {
      return attrs.href || '';
    }
  }
  return '';
}

function findTags(html, tagName) {
  const regex = new RegExp(`<${tagName}\\b([^>]*)>`, 'gi');
  return [...String(html || '').matchAll(regex)].map((match) => match[1]);
}

function parseAttributes(source) {
  const attrs = {};
  const text = String(source || '');
  const regex = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const match of text.matchAll(regex)) {
    const key = match[1].toLowerCase();
    attrs[key] = decodeHtml(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attrs;
}

function firstMatch(text, regex) {
  const match = String(text || '').match(regex);
  return match ? match[1] : '';
}

function stripScriptsAndStyles(html) {
  return String(html || '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
}

function countWords(text) {
  const cleaned = decodeHtml(String(text || '')).replace(/[^\p{L}\p{N}\s'-]/gu, ' ');
  return cleaned.trim() ? cleaned.trim().split(/\s+/).length : 0;
}

function cleanText(value) {
  return decodeHtml(String(value || '').replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num) => String.fromCodePoint(Number.parseInt(num, 10)));
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeXml(value) {
  return escapeHtml(value).replace(/'/g, '&apos;');
}

function stripHash(raw) {
  try {
    const url = new URL(raw);
    url.hash = '';
    return url.href;
  } catch {
    return raw;
  }
}

function normalizeComparableUrl(raw) {
  try {
    const url = new URL(raw);
    url.hash = '';
    url.searchParams.sort();
    const pathname = url.pathname === '/' ? '/' : url.pathname.replace(/\/+$/, '');
    return `${url.origin}${pathname}${url.search}`;
  } catch {
    return String(raw || '').replace(/\/+$/, '');
  }
}
