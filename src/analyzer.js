export function normalizeUrl(input) {
  const raw = String(input || '').trim();
  if (!raw) {
    throw new Error('Introduce una URL.');
  }

  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url;
  try {
    url = new URL(withProtocol);
  } catch {
    throw new Error(`URL no valida: ${raw}`);
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('La URL debe usar http o https.');
  }

  url.hash = '';
  return url;
}

export function analyzeHtml(html, pageUrl) {
  const baseUrl = resolveBaseUrl(html, pageUrl);
  const title = cleanText(firstMatch(html, /<title\b[^>]*>([\s\S]*?)<\/title>/i));
  const description = cleanText(findMetaContent(html, 'name', 'description'));
  const robotsMeta = cleanText(findMetaContent(html, 'name', 'robots'));
  const metaRefresh = cleanText(findMetaContent(html, 'http-equiv', 'refresh'));
  const viewport = cleanText(findMetaContent(html, 'name', 'viewport'));
  const canonical = findLinkHref(html, 'canonical');
  const favicon = findFavicon(html);
  const manifest = findLinkHref(html, 'manifest');
  const charset = findCharset(html);
  const lang = cleanText(firstMatch(html, /<html\b[^>]*\blang\s*=\s*["']?([^"'\s>]+)/i));
  const h1 = extractHeadings(html, 1);
  const h2 = extractHeadings(html, 2);
  const links = extractLinks(html, pageUrl, baseUrl);
  const internalLinks = links.filter((link) => link.sameOrigin);
  const externalLinks = links.filter((link) => !link.sameOrigin);
  const images = extractImages(html, baseUrl);
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
  const hreflang = extractHreflang(html, baseUrl);
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
    metaRefresh,
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

export function robotsAllows(robots, pathname) {
  const groups = (robots?.groups || []).filter((group) => group.agents.includes('*'));
  let best = null;

  for (const group of groups) {
    for (const rule of group.rules) {
      const pattern = rule.value.trim();
      if (!pattern) continue;
      if (!robotsRuleMatches(pattern, pathname)) continue;
      const specificity = pattern.replace(/[*$]/g, '').length;
      if (!best || specificity > best.specificity || (specificity === best.specificity && rule.directive === 'allow')) {
        best = { directive: rule.directive, specificity };
      }
    }
  }

  return !best || best.directive === 'allow';
}

function robotsRuleMatches(pattern, pathname) {
  const anchored = pattern.endsWith('$');
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  try {
    return new RegExp(`^${body}${anchored ? '$' : ''}`).test(pathname);
  } catch {
    return false;
  }
}

export function parseSitemap(text) {
  const body = String(text || '');
  const isSitemap = /<(urlset|sitemapindex)\b/i.test(body);
  const isIndex = /<sitemapindex\b/i.test(body);
  const urls = [...body.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)]
    .map((match) => decodeHtml(match[1].trim()))
    .filter(Boolean);
  return { isSitemap, isIndex, urls };
}

export function findDuplicates(values) {
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

export function summarizeCategories(checks) {
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

export function scoreToGrade(score) {
  const percent = Math.max(0, Math.min(100, Number(score) || 0));
  if (percent >= 90) return { label: 'Excellent', tone: 'good' };
  if (percent >= 75) return { label: 'Good', tone: 'good' };
  if (percent >= 60) return { label: 'Needs Work', tone: 'warn' };
  return { label: 'Critical', tone: 'bad' };
}

function resolveBaseUrl(html, pageUrl) {
  for (const tag of findTags(html, 'base')) {
    const attrs = parseAttributes(tag);
    if (!attrs.href) continue;
    try {
      return new URL(attrs.href, pageUrl).href;
    } catch {}
  }
  return pageUrl;
}

function extractLinks(html, pageUrl, baseUrl = pageUrl) {
  const links = [];
  const pageOrigin = new URL(pageUrl).origin;

  for (const match of String(html || '').matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const attrs = parseAttributes(match[1]);
    const href = attrs.href || '';
    if (!href || /^(#|mailto:|tel:|javascript:)/i.test(href.trim())) continue;

    try {
      const url = new URL(href, baseUrl);
      if (!['http:', 'https:'].includes(url.protocol)) continue;
      url.hash = '';
      links.push({
        href,
        url: url.href,
        text: cleanText(match[2]),
        sameOrigin: url.origin === pageOrigin
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
  for (const tagName of ['img', 'script', 'link', 'iframe', 'source', 'video', 'audio']) {
    for (const tag of findTags(html, tagName)) {
      const attrs = parseAttributes(tag);
      const candidates = [
        attrs.src,
        attrs.href,
        ...String(attrs.srcset || '').split(',').map((entry) => entry.trim().split(/\s+/)[0])
      ];
      for (const raw of candidates) {
        if (/^http:\/\//i.test(raw || '')) {
          items.push({ tag: tagName, url: raw });
        }
      }
    }
  }
  return items;
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

export function cleanText(value) {
  return decodeHtml(String(value || '').replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

export function decodeHtml(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num) => String.fromCodePoint(Number.parseInt(num, 10)))
    .replace(/&amp;/gi, '&');
}

export function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function escapeXml(value) {
  return escapeHtml(value).replace(/'/g, '&apos;');
}

export function normalizeComparableUrl(raw) {
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
