import { promises as dns } from 'node:dns';
import { URL } from 'node:url';

const USER_AGENT = 'interseo-auditor/1.0';
const DEFAULT_TIMEOUT_MS = 12000;
const PROBE_TIMEOUT_MS = 5500;
const MAX_RESPONSE_BYTES = 2_000_000;
const DEFAULT_CRAWL_LIMIT = 5;
const DEFAULT_LINK_PROBE_LIMIT = 12;
const DNS_TIMEOUT_MS = 3500;
const MAX_CRAWL_LIMIT = 40;

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
  { id: 'google_ready_core', category: 'Google', max: 2 },
  { id: 'response_time', category: 'Rendimiento', max: 4 },
  { id: 'redirect_chain', category: 'Rendimiento', max: 2 },
  { id: 'security_headers', category: 'Confianza', max: 4 },
  { id: 'mixed_content', category: 'Confianza', max: 3 },
  { id: 'x_robots_header', category: 'Indexacion', max: 3 },
  { id: 'canonical_absolute', category: 'Rastreo', max: 2 },
  { id: 'hreflang_valid', category: 'Indexacion', max: 2 },
  { id: 'twitter_cards', category: 'Indexacion', max: 2 },
  { id: 'sitemap_same_origin', category: 'Google', max: 3 },
  { id: 'sitemap_size_limit', category: 'Google', max: 2 },
  { id: 'crawl_completed', category: 'Crawler', max: 4 },
  { id: 'crawl_statuses', category: 'Crawler', max: 4 },
  { id: 'duplicate_titles', category: 'Crawler', max: 3 },
  { id: 'duplicate_descriptions', category: 'Crawler', max: 3 },
  { id: 'broken_internal_links', category: 'Crawler', max: 4 },
  { id: 'dns_resolves', category: 'Infra', max: 4 },
  { id: 'dns_latency', category: 'Infra', max: 3 },
  { id: 'dns_ipv6', category: 'Infra', max: 1 },
  { id: 'dns_nameservers', category: 'Infra', max: 2 },
  { id: 'dns_mail_auth', category: 'Infra', max: 2 }
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

async function fetchProbe(url, options = {}) {
  const controller = new AbortController();
  const startedAt = Date.now();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? PROBE_TIMEOUT_MS);

  try {
    let response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'accept': '*/*',
        'user-agent': USER_AGENT
      }
    });

    if (response.status === 405 || response.status === 403) {
      response = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'accept': '*/*',
          'user-agent': USER_AGENT
        }
      });
    }

    return {
      url,
      finalUrl: response.url,
      ok: response.ok,
      status: response.status,
      headers: headersToObject(response.headers),
      elapsedMs: Date.now() - startedAt
    };
  } catch (error) {
    return {
      url,
      finalUrl: url,
      ok: false,
      status: 0,
      headers: {},
      elapsedMs: Date.now() - startedAt,
      error: error.name === 'AbortError' ? 'Tiempo de espera agotado.' : error.message
    };
  } finally {
    clearTimeout(timeout);
  }
}
async function auditDns(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/^\.+|\.+$/g, '');
  const domain = guessDomain(host);
  const startedAt = Date.now();
  const lookupStartedAt = Date.now();
  const lookup = await dnsTask(() => dns.lookup(host, { all: true }));
  const lookupMs = Date.now() - lookupStartedAt;
  const [a, aaaa, ns, mx, txt, dmarc] = await Promise.all([
    dnsTask(() => dns.resolve4(host)),
    dnsTask(() => dns.resolve6(host)),
    dnsTask(() => dns.resolveNs(domain)),
    dnsTask(() => dns.resolveMx(domain)),
    dnsTask(() => dns.resolveTxt(domain)),
    dnsTask(() => dns.resolveTxt(`_dmarc.${domain}`))
  ]);
  const txtFlat = flattenTxt(txt.values);
  const dmarcFlat = flattenTxt(dmarc.values);
  const spf = txtFlat.find((entry) => /^v=spf1\b/i.test(entry)) || '';
  const dmarcRecord = dmarcFlat.find((entry) => /^v=dmarc1\b/i.test(entry)) || '';
  const addresses = Array.isArray(lookup.values) ? lookup.values : [];

  return {
    hostname: host,
    domain,
    elapsedMs: Date.now() - startedAt,
    lookupMs,
    resolves: lookup.ok && addresses.length > 0,
    addresses,
    a: a.values || [],
    aaaa: aaaa.values || [],
    ns: ns.values || [],
    mx: mx.values || [],
    spf,
    dmarc: dmarcRecord,
    errors: {
      lookup: lookup.error || null,
      a: a.error || null,
      aaaa: aaaa.error || null,
      ns: ns.error || null,
      mx: mx.error || null,
      txt: txt.error || null,
      dmarc: dmarc.error || null
    }
  };
}

async function dnsTask(fn) {
  try {
    const values = await timeoutPromise(fn(), DNS_TIMEOUT_MS);
    return { ok: true, values };
  } catch (error) {
    return { ok: false, values: [], error: error.code || error.message || String(error) };
  }
}

function timeoutPromise(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('DNS_TIMEOUT')), ms);
    })
  ]).finally(() => clearTimeout(timer));
}

function flattenTxt(values) {
  return (values || []).map((item) => Array.isArray(item) ? item.join('') : String(item));
}

function guessDomain(hostname) {
  const parts = String(hostname || '').split('.').filter(Boolean);
  if (parts.length <= 2) return parts.join('.');
  return parts.slice(-2).join('.');
}

function defaultContactEmailForUrl(url) {
  const hostname = new URL(url).hostname.replace(/^www\./i, '');
  return `contacto@${hostname}`;
}
function headersToObject(headers) {
  const out = {};
  for (const [key, value] of headers.entries()) {
    out[key.toLowerCase()] = value;
  }
  return out;
}

export async function auditSite(input) {
  const request = typeof input === 'string' ? { url: input } : input || {};
  const targetUrl = normalizeUrl(request.url || request);
  const startedAt = Date.now();
  const crawlLimit = clampNumber(request.crawlLimit ?? request.pageLimit ?? DEFAULT_CRAWL_LIMIT, 1, MAX_CRAWL_LIMIT);
  const linkProbeLimit = clampNumber(request.linkProbeLimit ?? DEFAULT_LINK_PROBE_LIMIT, 0, 120);
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

  const [sitemap, policies, dnsInfo] = await Promise.all([
    auditSitemap(origin, robots.sitemaps, targetUrl.href),
    auditPolicies(origin, page.links),
    auditDns(targetUrl.hostname)
  ]);

  const crawl = await auditCrawl({
    targetUrl: targetUrl.href,
    origin,
    homepage,
    page,
    sitemap,
    crawlLimit,
    linkProbeLimit
  });

  const checks = buildChecks({
    targetUrl,
    homepage,
    page,
    robotsResponse,
    robots,
    sitemap,
    policies,
    crawl,
    dns: dnsInfo
  });

  const rawScore = checks.reduce((sum, check) => sum + check.points, 0);
  const rawMax = checks.reduce((sum, check) => sum + check.max, 0);
  const score = rawMax ? Math.round((rawScore / rawMax) * 100) : 0;
  const categories = summarizeCategories(checks);
  const discoveredUrls = collectDiscoveredUrls(targetUrl.href, page, sitemap, policies, crawl);
  const inferredSiteName = cleanText(request.siteName || request.name || inferSiteName(page, targetUrl));
  const kit = buildGeneratedKit({
    url: targetUrl.href,
    siteName: inferredSiteName,
    description: request.description || page.description || '',
    businessName: request.businessName || inferredSiteName,
    contactEmail: defaultContactEmailForUrl(targetUrl.href),
    discoveredUrls
  });

  const result = {
    auditedAt: new Date().toISOString(),
    elapsedMs: Date.now() - startedAt,
    inputUrl: targetUrl.href,
    finalUrl: homepage.finalUrl || targetUrl.href,
    siteName: inferredSiteName,
    score,
    maxScore: 100,
    rawScore,
    rawMax,
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
    crawl,
    dns: dnsInfo,
    kit
  };

  result.fixPrompts = buildFixPrompts(result);
  result.reports = buildAuditReports(result);
  result.kit.files.push(...buildReportFiles(result));
  return result;
}
function inferSiteName(page, targetUrl) {
  const candidates = [
    page.openGraph?.siteName,
    page.openGraph?.title,
    page.title,
    page.h1?.[0],
    targetUrl.hostname.replace(/^www\./i, '')
  ];

  for (const candidate of candidates) {
    const cleaned = cleanText(String(candidate || '').split(/\s[-|·:]\s/)[0]);
    if (cleaned && cleaned.length >= 2 && cleaned.length <= 80) return cleaned;
  }

  return targetUrl.hostname.replace(/^www\./i, '');
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
    twitter: {},
    hasTwitterCard: false,
    hreflang: [],
    mixedContent: [],
    manifest: '',
    charset: '',
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
  const manifest = findLinkHref(html, 'manifest');
  const charset = findCharset(html);
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
    type: findMetaContent(html, 'property', 'og:type'),
    siteName: findMetaContent(html, 'property', 'og:site_name')
  };
  const twitter = {
    card: findMetaContent(html, 'name', 'twitter:card'),
    title: findMetaContent(html, 'name', 'twitter:title'),
    description: findMetaContent(html, 'name', 'twitter:description'),
    image: findMetaContent(html, 'name', 'twitter:image')
  };
  const hreflang = extractHreflang(html, pageUrl);
  const mixedContent = extractMixedContent(html, pageUrl);

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
    twitter,
    hasTwitterCard: Object.values(twitter).filter(Boolean).length >= 2,
    hreflang,
    mixedContent,
    manifest,
    charset,
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
  const sitemapOrigin = new URL(origin).origin;
  const bestUrls = best?.urls || [];
  const foreignUrlCount = bestUrls.filter((raw) => {
    try { return new URL(raw).origin !== sitemapOrigin; } catch { return true; }
  }).length;
  const sameOriginOnly = best ? foreignUrlCount === 0 : false;
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
    sameOriginOnly,
    foreignUrlCount,
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

async function auditCrawl({ targetUrl, origin, homepage, page, sitemap, crawlLimit, linkProbeLimit }) {
  const candidates = buildCrawlCandidates({ targetUrl, origin, page, sitemap, crawlLimit });
  const pages = await Promise.all(candidates.map(async (url) => {
    if (normalizeComparableUrl(url) === normalizeComparableUrl(homepage.finalUrl || targetUrl)) {
      return pageToCrawlEntry({ url, response: homepage, page });
    }

    const response = await fetchText(url, { timeoutMs: PROBE_TIMEOUT_MS });
    const analyzed = response.ok && isHtmlResponse(response) ? analyzeHtml(response.text || '', response.finalUrl || url) : emptyPageAnalysis(url);
    return pageToCrawlEntry({ url, response, page: analyzed });
  }));

  const linkTargets = uniqueInternalLinkTargets(pages, origin, linkProbeLimit);
  const linkResults = await Promise.all(linkTargets.map((url) => fetchProbe(url)));
  const brokenInternalLinks = linkResults.filter((item) => !item.ok || item.status >= 400);
  const duplicateTitles = findDuplicates(pages.map((item) => item.title).filter(Boolean));
  const duplicateDescriptions = findDuplicates(pages.map((item) => item.description).filter(Boolean));
  const okPages = pages.filter((item) => item.ok && item.status < 400);

  return {
    requestedLimit: crawlLimit,
    linkProbeLimit,
    seedCount: candidates.length,
    pages,
    linkProbes: linkResults,
    brokenInternalLinks,
    duplicateTitles,
    duplicateDescriptions,
    totals: {
      pages: pages.length,
      ok: okPages.length,
      errors: pages.length - okPages.length,
      noindex: pages.filter((item) => item.noindex || item.xRobotsNoindex).length,
      missingTitle: pages.filter((item) => item.ok && !item.title).length,
      missingDescription: pages.filter((item) => item.ok && !item.description).length,
      missingH1: pages.filter((item) => item.ok && item.h1Count === 0).length,
      thinContent: pages.filter((item) => item.ok && item.wordCount < 120).length,
      imagesMissingAlt: pages.reduce((sum, item) => sum + item.imagesMissingAlt, 0),
      duplicateTitles: duplicateTitles.reduce((sum, item) => sum + item.count, 0),
      duplicateDescriptions: duplicateDescriptions.reduce((sum, item) => sum + item.count, 0),
      brokenInternalLinks: brokenInternalLinks.length,
      averageElapsedMs: pages.length ? Math.round(pages.reduce((sum, item) => sum + item.elapsedMs, 0) / pages.length) : 0
    }
  };
}

function buildCrawlCandidates({ targetUrl, origin, page, sitemap, crawlLimit }) {
  const urls = new Map();
  const add = (raw) => {
    try {
      const url = new URL(raw, origin);
      if (!['http:', 'https:'].includes(url.protocol)) return;
      if (url.origin !== origin) return;
      url.hash = '';
      if (!isLikelyHtmlUrl(url)) return;
      urls.set(normalizeComparableUrl(url.href), url.href);
    } catch {}
  };

  add(targetUrl);
  for (const url of sitemap.sampledUrls || []) add(url);
  for (const link of page.internalLinks || []) add(link.url);
  return [...urls.values()].slice(0, crawlLimit);
}

function pageToCrawlEntry({ url, response, page }) {
  const headers = response.headers || {};
  const xRobots = headers['x-robots-tag'] || '';
  const contentType = headers['content-type'] || '';

  return {
    url,
    finalUrl: response.finalUrl || url,
    ok: Boolean(response.ok),
    status: response.status || 0,
    elapsedMs: response.elapsedMs || 0,
    contentType,
    title: page.title,
    titleLength: page.titleLength,
    description: page.description,
    descriptionLength: page.descriptionLength,
    canonical: page.canonical,
    canonicalAbsolute: isAbsoluteHttpUrl(page.canonical),
    noindex: page.noindex,
    xRobots,
    xRobotsNoindex: /\bnoindex\b/i.test(xRobots),
    h1Count: page.h1.length,
    h1: page.h1.slice(0, 3),
    wordCount: page.wordCount,
    internalLinks: page.internalLinks.length,
    externalLinks: page.externalLinks.length,
    images: page.images.length,
    imagesMissingAlt: page.imagesMissingAlt.length,
    jsonLdTypes: page.jsonLdTypes,
    pageLinks: page.internalLinks,
    hasOpenGraph: page.hasOpenGraph,
    hasTwitterCard: page.hasTwitterCard,
    hreflangCount: page.hreflang.length,
    mixedContent: page.mixedContent.length
  };
}

function uniqueInternalLinkTargets(pages, origin, limit) {
  const urls = new Map();
  if (limit <= 0) return [];

  for (const item of pages) {
    for (const link of item.pageLinks || []) {
      addInternalProbeUrl(urls, link.url, origin);
    }
  }

  if (urls.size === 0) {
    for (const item of pages) {
      try {
        addInternalProbeUrl(urls, item.finalUrl || item.url, origin);
      } catch {}
    }
  }

  return [...urls.values()].slice(0, limit);
}

function addInternalProbeUrl(map, raw, origin) {
  try {
    const url = new URL(raw, origin);
    if (!['http:', 'https:'].includes(url.protocol)) return;
    if (url.origin !== origin) return;
    url.hash = '';
    map.set(normalizeComparableUrl(url.href), url.href);
  } catch {}
}

function findDuplicates(values) {
  const map = new Map();
  for (const value of values) {
    const key = cleanText(value).toLowerCase();
    if (!key) continue;
    map.set(key, (map.get(key) || 0) + 1);
  }

  return [...map.entries()]
    .filter(([, count]) => count > 1)
    .map(([value, count]) => ({ value, count }));
}

function isLikelyHtmlUrl(url) {
  return !/\.(?:jpg|jpeg|png|gif|webp|avif|svg|pdf|zip|rar|7z|mp4|mp3|css|js|ico|woff2?|ttf|eot)$/i.test(url.pathname);
}

function isHtmlResponse(response) {
  const contentType = response.headers?.['content-type'] || '';
  return !contentType || /text\/html|application\/xhtml/i.test(contentType);
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

export function buildChecks({ targetUrl, homepage, page, robotsResponse, robots, sitemap, policies, crawl, dns }) {
  const contentType = homepage.headers?.['content-type'] || '';
  const hasHtmlContentType = /text\/html|application\/xhtml/i.test(contentType);
  const titlePoints = scoreLength(page.titleLength, 10, 65, 5, page.title ? 3 : 0);
  const descriptionPoints = scoreLength(page.descriptionLength, 70, 165, 5, page.description ? 3 : 0);
  const h1Points = page.h1.length === 1 ? 4 : page.h1.length > 1 ? 2 : 0;
  const imageAltPoints = page.images.length === 0 ? 2 : page.imagesMissingAlt.length === 0 ? 2 : page.imagesMissingAlt.length <= Math.ceil(page.images.length * 0.2) ? 1 : 0;
  const jsonLdUseful = page.jsonLdTypes.some((type) =>
    /organization|localbusiness|website|webpage|article|product|softwareapplication|service/i.test(type)
  );
  const xRobots = homepage.headers?.['x-robots-tag'] || '';
  const xRobotsNoindex = /\bnoindex\b/i.test(xRobots);
  const securityHeaders = ['strict-transport-security', 'x-content-type-options', 'content-security-policy', 'referrer-policy'];
  const securityHeaderCount = securityHeaders.filter((header) => Boolean(homepage.headers?.[header])).length;
  const securityPoints = securityHeaderCount >= 3 ? 4 : securityHeaderCount >= 2 ? 3 : securityHeaderCount === 1 ? 1 : 0;
  const canonicalAbsolute = isAbsoluteHttpUrl(page.canonical);
  const hreflangValid = page.hreflang.length === 0 || page.hreflang.every((item) => item.hreflang && isAbsoluteHttpUrl(item.href));
  const sitemapSameOrigin = sitemap.found && sitemap.sameOriginOnly;
  const sitemapWithinLimits = sitemap.found && sitemap.urlCount <= 50000;
  const crawlTotals = crawl?.totals || {};
  const crawlPages = crawlTotals.pages || 0;
  const dnsAddresses = Array.isArray(dns?.addresses) ? dns.addresses : [];
  const hasDnsAddress = Boolean(dns?.resolves && dnsAddresses.length);
  const hasIpv6 = (dns?.aaaa || []).length > 0 || dnsAddresses.some((item) => item.family === 6);
  const hasNameservers = (dns?.ns || []).length >= 2;
  const hasMailAuth = Boolean(dns?.spf && dns?.dmarc);
  const coreGoogleReady = homepage.ok && !page.noindex && !xRobotsNoindex && !robots.blocksAll && sitemap.found;

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
    }),
    makeCheck({
      id: 'response_time',
      points: homepage.ok ? (homepage.elapsedMs <= 1200 ? 4 : homepage.elapsedMs <= 2500 ? 2 : homepage.elapsedMs <= 4500 ? 1 : 0) : 0,
      label: 'Respuesta rapida de la home',
      evidence: homepage.ok ? `${homepage.elapsedMs} ms` : homepage.error || `HTTP ${homepage.status}`,
      recommendation: 'Reduce TTFB, cachea HTML y optimiza servidor para que la home responda rapido.'
    }),
    makeCheck({
      id: 'redirect_chain',
      points: homepage.ok ? (normalizeComparableUrl(targetUrl.href) === normalizeComparableUrl(homepage.finalUrl || targetUrl.href) ? 2 : 1) : 0,
      label: 'Redireccion inicial controlada',
      evidence: homepage.finalUrl && homepage.finalUrl !== targetUrl.href ? `${targetUrl.href} -> ${homepage.finalUrl}` : 'Sin redireccion inicial',
      recommendation: 'Evita cadenas de redireccion y deja una unica canonica HTTPS.'
    }),
    makeCheck({
      id: 'security_headers',
      points: securityPoints,
      label: 'Cabeceras de confianza basicas',
      evidence: `${securityHeaderCount} de ${securityHeaders.length} cabeceras detectadas`,
      recommendation: 'Configura HSTS, X-Content-Type-Options, Content-Security-Policy y Referrer-Policy cuando aplique.'
    }),
    makeCheck({
      id: 'mixed_content',
      points: page.mixedContent.length === 0 ? 3 : page.mixedContent.length <= 2 ? 1 : 0,
      label: 'Sin contenido mixto HTTP',
      evidence: `${page.mixedContent.length} recursos HTTP en pagina HTTPS`,
      recommendation: 'Sirve imagenes, scripts, iframes y CSS siempre por HTTPS.'
    }),
    makeCheck({
      id: 'x_robots_header',
      points: xRobotsNoindex ? 0 : 3,
      label: 'X-Robots-Tag no bloquea indexacion',
      evidence: xRobots || 'Sin X-Robots-Tag restrictiva',
      recommendation: 'Retira X-Robots-Tag: noindex de paginas que quieras posicionar.'
    }),
    makeCheck({
      id: 'canonical_absolute',
      points: canonicalAbsolute ? 2 : page.canonical ? 1 : 0,
      label: 'Canonical absoluto',
      evidence: page.canonical || 'Sin canonical',
      recommendation: 'Usa canonical absoluto con protocolo y dominio.'
    }),
    makeCheck({
      id: 'hreflang_valid',
      points: hreflangValid ? 2 : 0,
      label: 'Hreflang valido si existe',
      evidence: page.hreflang.length ? `${page.hreflang.length} alternates` : 'No aplica',
      recommendation: 'Si el sitio es multiidioma, usa hreflang con URLs absolutas y reciprocas.'
    }),
    makeCheck({
      id: 'twitter_cards',
      points: page.hasTwitterCard ? 2 : Object.values(page.twitter || {}).some(Boolean) ? 1 : 0,
      label: 'Twitter Cards configuradas',
      evidence: page.hasTwitterCard ? 'Twitter Card basica detectada' : 'Faltan metadatos twitter:*',
      recommendation: 'Anade twitter:card, twitter:title, twitter:description y twitter:image para mejorar previews.'
    }),
    makeCheck({
      id: 'sitemap_same_origin',
      points: sitemapSameOrigin ? 3 : sitemap.found ? 1 : 0,
      label: 'Sitemap usa URLs del mismo dominio',
      evidence: sitemap.found ? `${sitemap.foreignUrlCount || 0} URL(s) externas` : 'Sin sitemap',
      recommendation: 'El sitemap debe listar URLs canonicas del mismo dominio y protocolo principal.'
    }),
    makeCheck({
      id: 'sitemap_size_limit',
      points: sitemapWithinLimits ? 2 : sitemap.found ? 0 : 0,
      label: 'Sitemap dentro de limites',
      evidence: sitemap.found ? `${sitemap.urlCount} URL(s)` : 'Sin sitemap',
      recommendation: 'Divide sitemaps grandes en indices antes de superar 50.000 URLs por archivo.'
    }),
    makeCheck({
      id: 'crawl_completed',
      points: crawlPages >= Math.min(crawl?.requestedLimit || 1, 2) ? 4 : crawlPages > 0 ? 2 : 0,
      label: 'Crawler interno ejecutado',
      evidence: `${crawlPages} pagina(s) analizadas`,
      recommendation: 'Ejecuta el modo full con mas paginas para detectar problemas fuera de la home.'
    }),
    makeCheck({
      id: 'crawl_statuses',
      points: (crawlTotals.errors || 0) === 0 ? 4 : (crawlTotals.errors || 0) <= 1 ? 2 : 0,
      label: 'Paginas rastreadas sin errores HTTP',
      evidence: `${crawlTotals.errors || 0} error(es) en ${crawlPages} pagina(s)`,
      recommendation: 'Corrige 4xx/5xx internos y redirecciones innecesarias.'
    }),
    makeCheck({
      id: 'duplicate_titles',
      points: (crawlTotals.duplicateTitles || 0) === 0 ? 3 : 0,
      label: 'Titles sin duplicados en crawl',
      evidence: `${crawlTotals.duplicateTitles || 0} duplicado(s)`,
      recommendation: 'Cada pagina indexable debe tener un title unico y descriptivo.'
    }),
    makeCheck({
      id: 'duplicate_descriptions',
      points: (crawlTotals.duplicateDescriptions || 0) === 0 ? 3 : 0,
      label: 'Descriptions sin duplicados en crawl',
      evidence: `${crawlTotals.duplicateDescriptions || 0} duplicado(s)`,
      recommendation: 'Evita meta descriptions repetidas en paginas importantes.'
    }),
    makeCheck({
      id: 'broken_internal_links',
      points: (crawlTotals.brokenInternalLinks || 0) === 0 ? 4 : (crawlTotals.brokenInternalLinks || 0) <= 2 ? 1 : 0,
      label: 'Enlaces internos sin rotos',
      evidence: `${crawlTotals.brokenInternalLinks || 0} enlace(s) roto(s)`,
      recommendation: 'Actualiza o elimina enlaces internos que devuelvan 4xx, 5xx o timeout.'
    }),
    makeCheck({
      id: 'dns_resolves',
      points: hasDnsAddress ? 4 : 0,
      label: 'DNS resuelve el dominio',
      evidence: hasDnsAddress ? `${dnsAddresses.length} direccion(es) detectadas` : dns?.errors?.lookup || 'Sin respuesta DNS',
      recommendation: 'Configura registros A o AAAA validos para el dominio principal.'
    }),
    makeCheck({
      id: 'dns_latency',
      points: hasDnsAddress && dns.lookupMs <= 120 ? 3 : hasDnsAddress && dns.lookupMs <= 350 ? 2 : hasDnsAddress ? 1 : 0,
      label: 'Resolucion DNS rapida',
      evidence: `${dns?.lookupMs ?? 0} ms`,
      recommendation: 'Usa DNS fiable, evita cadenas CNAME innecesarias y revisa proveedor si la resolucion es lenta.'
    }),
    makeCheck({
      id: 'dns_ipv6',
      points: hasIpv6 ? 1 : 0,
      label: 'IPv6 disponible',
      evidence: hasIpv6 ? 'AAAA detectado' : 'Sin AAAA detectado',
      recommendation: 'Anade IPv6 si el hosting/CDN lo soporta para mejorar cobertura y resiliencia.'
    }),
    makeCheck({
      id: 'dns_nameservers',
      points: hasNameservers ? 2 : (dns?.ns || []).length ? 1 : 0,
      label: 'Nameservers configurados',
      evidence: `${(dns?.ns || []).length} NS detectados`,
      recommendation: 'Mantener al menos dos nameservers autoritativos mejora disponibilidad DNS.'
    }),
    makeCheck({
      id: 'dns_mail_auth',
      points: hasMailAuth ? 2 : (dns?.spf || dns?.dmarc) ? 1 : 0,
      label: 'SPF y DMARC basicos',
      evidence: `SPF ${dns?.spf ? 'OK' : 'falta'}, DMARC ${dns?.dmarc ? 'OK' : 'falta'}`,
      recommendation: 'Publica SPF y DMARC para mejorar confianza del dominio y entregabilidad de correos.'
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
  const percent = Math.max(0, Math.min(100, Number(score) || 0));
  if (percent >= 90) return { label: 'Excelente', tone: 'good' };
  if (percent >= 75) return { label: 'Bueno', tone: 'good' };
  if (percent >= 60) return { label: 'Mejorable', tone: 'warn' };
  return { label: 'Critico', tone: 'bad' };
}

function collectDiscoveredUrls(homepageUrl, page, sitemap, policies, crawl) {
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
  for (const crawled of crawl?.pages || []) {
    if (crawled.ok && crawled.finalUrl) urls.add(stripHash(crawled.finalUrl));
  }
  return [...urls].slice(0, 250);
}

export function buildFixPrompts(result) {
  const siteName = result.siteName || result.kit?.siteName || result.finalUrl || result.inputUrl;
  const url = result.finalUrl || result.inputUrl;
  const issues = (result.priority || []).slice(0, 12).map((check) => ({
    id: check.id,
    category: check.category,
    problem: check.label,
    evidence: check.evidence,
    fix: check.recommendation
  }));
  const issueText = issues.map((item, index) => `${index + 1}. [${item.category}] ${item.problem}: ${item.fix} Evidencia: ${item.evidence}`).join('\n');
  const kitFiles = (result.kit?.files || []).map((file) => file.path).join(', ');
  const context = [
    `Sitio: ${siteName}`,
    `URL: ${url}`,
    `Puntuacion interseo: ${result.score}/100 (${result.grade?.label || 'sin nota'})`,
    `DNS: ${result.dns?.resolves ? 'resuelve' : 'no resuelve'} (${result.dns?.lookupMs ?? 0} ms)`,
    `Sitemap: ${result.sitemap?.found ? result.sitemap.url : 'falta'}`,
    `robots.txt: ${result.robots?.exists ? 'existe' : 'falta o no accesible'}`,
    `Paginas rastreadas: ${result.crawl?.totals?.pages || 0}`,
    `Archivos sugeridos por interseo: ${kitFiles}`
  ].join('\n');

  const skill = [
    'Use $interseo para arreglar el SEO tecnico de este proyecto.',
    '',
    context,
    '',
    'Problemas priorizados:',
    issueText || 'No hay problemas priorizados.',
    '',
    'Tareas:',
    '- Lee el proyecto actual y localiza donde se gestionan head tags, rutas publicas, sitemap, robots y legal pages.',
    '- Aplica cambios reales en el codigo o archivos estaticos para corregir los problemas priorizados.',
    '- Genera o actualiza robots.txt, sitemap.xml, canonical, title, meta description, JSON-LD, Open Graph, Twitter Cards, paginas legales y enlaces internos cuando falten.',
    '- Si hay problemas DNS, explica el cambio exacto que debe hacerse en el proveedor DNS y no finjas haberlo aplicado si no tienes acceso.',
    '- Ejecuta tests/build disponibles y vuelve a pasar interseo al final.',
    '- Entrega resumen corto con archivos tocados, score esperado y pasos pendientes de Google Search Console.',
    ''
  ].join('\n');

  const mcp = [
    'Usa el MCP `interseo` para auditar y arreglar este sitio.',
    '',
    '1. Llama a la herramienta MCP `audit_site` con: { "url": "' + url + '", "crawlLimit": 12, "linkProbeLimit": 24 }.',
    '2. Toma los checks con status fail/warn como backlog priorizado.',
    '3. Modifica el repositorio actual para corregir los problemas de mayor impacto primero.',
    '4. Llama a `generate_seo_kit` si faltan robots.txt, sitemap.xml, JSON-LD o plantillas legales.',
    '5. Vuelve a llamar a `audit_site` y compara el score antes/despues.',
    '',
    'Contexto actual:',
    context,
    '',
    'Problemas priorizados:',
    issueText || 'No hay problemas priorizados.',
    ''
  ].join('\n');

  const direct = [
    'Arregla el SEO tecnico de este proyecto usando este informe interseo como fuente de verdad.',
    '',
    context,
    '',
    'Problemas priorizados:',
    issueText || 'No hay problemas priorizados.',
    '',
    'Implementa los cambios en el repo, valida con tests/build, y deja instrucciones DNS/Search Console solo cuando no puedas aplicarlas desde codigo.',
    ''
  ].join('\n');

  return { skill, mcp, direct, issues };
}
export function buildAuditReports(result) {
  return {
    markdown: buildMarkdownReport(result),
    checksCsv: buildChecksCsv(result.checks || []),
    pagesCsv: buildPagesCsv(result.crawl?.pages || []),
    fixPrompt: result.fixPrompts?.direct || buildFixPrompts(result).direct
  };
}

function buildReportFiles(result) {
  const reports = result.reports || buildAuditReports(result);
  const prompts = result.fixPrompts || buildFixPrompts(result);
  return [
    {
      path: 'reports/interseo-audit.md',
      language: 'markdown',
      content: reports.markdown
    },
    {
      path: 'reports/checks.csv',
      language: 'csv',
      content: reports.checksCsv
    },
    {
      path: 'reports/pages.csv',
      language: 'csv',
      content: reports.pagesCsv
    },
    {
      path: 'reports/audit.json',
      language: 'json',
      content: `${JSON.stringify(compactAuditJson(result), null, 2)}\n`
    },
    {
      path: 'prompts/fix-with-skill.md',
      language: 'markdown',
      content: prompts.skill
    },
    {
      path: 'prompts/fix-with-mcp.md',
      language: 'markdown',
      content: prompts.mcp
    },
    {
      path: 'prompts/fix-direct.md',
      language: 'markdown',
      content: prompts.direct
    }
  ];
}

function buildMarkdownReport(result) {
  const lines = [
    `# Informe interseo`,
    '',
    `URL: ${result.finalUrl}`,
    `Fecha: ${result.auditedAt}`,
    `Puntuacion: ${result.score}/100 (${result.grade.label})`,
    `Paginas rastreadas: ${result.crawl?.totals?.pages || 0}`,
    `DNS: ${result.dns?.resolves ? 'resuelve' : 'no resuelve'} (${result.dns?.lookupMs ?? 0} ms)`,
    '',
    '## Prioridad',
    ''
  ];

  for (const check of (result.priority || []).slice(0, 15)) {
    lines.push(`- [${check.category}] ${check.label}: ${check.recommendation}`);
  }

  lines.push('', '## Categorias', '');
  for (const category of result.categories || []) {
    lines.push(`- ${category.name}: ${category.percent}% (${category.score}/${category.max})`);
  }

  lines.push('', '## DNS e infra', '');
  lines.push(`- Host: ${result.dns?.hostname || ''}`);
  lines.push(`- Dominio base: ${result.dns?.domain || ''}`);
  lines.push(`- Direcciones: ${(result.dns?.addresses || []).map((item) => item.address).join(', ') || 'sin datos'}`);
  lines.push(`- Nameservers: ${(result.dns?.ns || []).join(', ') || 'sin datos'}`);
  lines.push(`- SPF: ${result.dns?.spf ? 'OK' : 'falta'}`);
  lines.push(`- DMARC: ${result.dns?.dmarc ? 'OK' : 'falta'}`);

  lines.push('', '## Crawler', '');
  const totals = result.crawl?.totals || {};
  lines.push(`- OK: ${totals.ok || 0}`);
  lines.push(`- Errores HTTP: ${totals.errors || 0}`);
  lines.push(`- Paginas con noindex: ${totals.noindex || 0}`);
  lines.push(`- Titles duplicados: ${totals.duplicateTitles || 0}`);
  lines.push(`- Descriptions duplicadas: ${totals.duplicateDescriptions || 0}`);
  lines.push(`- Enlaces internos rotos: ${totals.brokenInternalLinks || 0}`);

  lines.push('', '## Envio a Google', '');
  lines.push(`- Sitemap: ${result.sitemap?.url || 'pendiente'}`);
  lines.push(`- robots.txt: ${result.robots?.url || 'pendiente'}`);
  lines.push('- Verifica dominio en Google Search Console.');
  lines.push('- Envia el sitemap desde el informe Sitemaps.');
  lines.push('- Usa inspeccion de URL para pedir recrawl de la home despues de publicar cambios.');
  lines.push('', '## Prompt para arreglarlo', '');
  lines.push('El kit incluye prompts listos en prompts/fix-with-skill.md, prompts/fix-with-mcp.md y prompts/fix-direct.md.');
  lines.push('');

  return lines.join('\n');
}

function buildChecksCsv(checks) {
  const rows = [['category', 'id', 'status', 'points', 'max', 'label', 'evidence', 'recommendation']];
  for (const check of checks) {
    rows.push([check.category, check.id, check.status, check.points, check.max, check.label, check.evidence, check.recommendation]);
  }
  return csv(rows);
}

function buildPagesCsv(pages) {
  const rows = [['url', 'status', 'ok', 'title', 'description', 'canonical', 'noindex', 'h1_count', 'word_count', 'internal_links', 'images_missing_alt', 'elapsed_ms']];
  for (const page of pages) {
    rows.push([page.finalUrl || page.url, page.status, page.ok, page.title, page.description, page.canonical, page.noindex || page.xRobotsNoindex, page.h1Count, page.wordCount, page.internalLinks, page.imagesMissingAlt, page.elapsedMs]);
  }
  return csv(rows);
}

function csv(rows) {
  return `${rows.map((row) => row.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')}\n`;
}

function compactAuditJson(result) {
  return {
    auditedAt: result.auditedAt,
    inputUrl: result.inputUrl,
    finalUrl: result.finalUrl,
    score: result.score,
    grade: result.grade,
    categories: result.categories,
    priority: (result.priority || []).slice(0, 20),
    robots: result.robots,
    sitemap: result.sitemap,
    policies: result.policies,
    dns: result.dns,
    fixPrompts: result.fixPrompts,
    crawl: {
      totals: result.crawl?.totals || {},
      pages: result.crawl?.pages || [],
      brokenInternalLinks: result.crawl?.brokenInternalLinks || []
    }
  };
}
export function buildGeneratedKit(input) {
  const targetUrl = normalizeUrl(input.url);
  const origin = targetUrl.origin;
  const siteName = cleanText(input.siteName || targetUrl.hostname) || targetUrl.hostname;
  const businessName = cleanText(input.businessName || siteName) || siteName;
  const description = cleanText(input.description || `Sitio web oficial de ${siteName}.`);
  const contactEmail = cleanText(input.contactEmail || defaultContactEmailForUrl(targetUrl.href));
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
    },
    {
      path: 'llms.txt',
      language: 'text',
      content: [`# ${siteName}`, '', `> ${description}`, '', `Sitio: ${origin}`, `Sitemap: ${sitemapUrl}`, `Contacto: ${contactEmail}`, ''].join('\n')
    },
    {
      path: 'humans.txt',
      language: 'text',
      content: [`Team: ${businessName}`, `Site: ${origin}`, `Contact: ${contactEmail}`, `Updated: ${today}`, ''].join('\n')
    },
    {
      path: '.well-known/security.txt',
      language: 'text',
      content: [`Contact: mailto:${contactEmail}`, `Canonical: ${origin}/.well-known/security.txt`, `Expires: ${new Date(Date.now() + 15552000000).toISOString().slice(0, 10)}T00:00:00Z`, ''].join('\n')
    },
    {
      path: 'google-site-verification.html',
      language: 'html',
      content: ['google-site-verification: REEMPLAZA-ESTE-TOKEN.html', ''].join('\n')
    },
    {
      path: 'interseo.mcp.json',
      language: 'json',
      content: `${JSON.stringify({ mcpServers: { interseo: { command: 'node', args: ['src/mcp.js'] } } }, null, 2)}\n`
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

function findCharset(html) {
  for (const tag of findTags(html, 'meta')) {
    const attrs = parseAttributes(tag);
    if (attrs.charset) return attrs.charset;
    if ((attrs['http-equiv'] || '').toLowerCase() === 'content-type') {
      const match = String(attrs.content || '').match(/charset=([^;\s]+)/i);
      if (match) return match[1];
    }
  }
  return '';
}

function extractHreflang(html, pageUrl) {
  const items = [];
  for (const tag of findTags(html, 'link')) {
    const attrs = parseAttributes(tag);
    const rel = (attrs.rel || '').toLowerCase().split(/\s+/);
    if (!rel.includes('alternate') || !attrs.hreflang || !attrs.href) continue;

    try {
      items.push({
        hreflang: attrs.hreflang.toLowerCase(),
        href: new URL(attrs.href, pageUrl).href
      });
    } catch {}
  }
  return items;
}

function extractMixedContent(html, pageUrl) {
  const base = new URL(pageUrl);
  if (base.protocol !== 'https:') return [];

  const items = [];
  for (const tagName of ['img', 'script', 'link', 'iframe', 'source']) {
    for (const tag of findTags(html, tagName)) {
      const attrs = parseAttributes(tag);
      const raw = attrs.src || attrs.href || attrs.srcset || '';
      if (/^http:\/\//i.test(raw)) {
        items.push({ tag: tagName, url: raw.split(/\s+/)[0] });
      }
    }
  }
  return items;
}

function isAbsoluteHttpUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, Math.round(number)));
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
