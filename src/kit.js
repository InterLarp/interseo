import { cleanText, escapeHtml, escapeXml, normalizeComparableUrl, normalizeUrl } from './analyzer.js';

export function buildGeneratedKit(input) {
  const targetUrl = normalizeUrl(input.url);
  const origin = targetUrl.origin;
  const siteName = cleanText(input.siteName || targetUrl.hostname) || targetUrl.hostname;
  const businessName = cleanText(input.businessName || siteName) || siteName;
  const description = cleanText(input.description || `Official website for ${siteName}.`);
  const contactEmail = cleanText(input.contactEmail || defaultContactEmailForUrl(targetUrl.href));
  const today = new Date().toISOString().slice(0, 10);
  const urls = normalizeKitUrls(input.discoveredUrls || [targetUrl.href], origin);
  const sitemapUrl = new URL('/sitemap.xml', origin).href;
  const privacyUrl = new URL('/privacy-policy', origin).href;
  const cookiesUrl = new URL('/cookie-policy', origin).href;
  const termsUrl = new URL('/legal-notice', origin).href;

  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${origin}/#organization`,
        name: businessName,
        url: origin,
        email: contactEmail.includes('@') ? contactEmail : undefined,
        sameAs: []
      },
      {
        '@type': 'WebSite',
        '@id': `${origin}/#website`,
        name: siteName,
        url: origin,
        description,
        publisher: { '@id': `${origin}/#organization` },
        inLanguage: cleanText(input.lang || '') || undefined
      }
    ]
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
        ...urls.map((url) => {
          const isHome = normalizeComparableUrl(url) === normalizeComparableUrl(`${origin}/`);
          return [
            '  <url>',
            `    <loc>${escapeXml(url)}</loc>`,
            `    <lastmod>${today}</lastmod>`,
            `    <changefreq>${isHome ? 'daily' : 'weekly'}</changefreq>`,
            `    <priority>${isHome ? '1.0' : '0.7'}</priority>`,
            '  </url>'
          ].join('\n');
        }),
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
        `# Google Launch Checklist for ${siteName}`,
        '',
        `- Publish \`robots.txt\` at \`${origin}/robots.txt\`.`,
        `- Publish \`sitemap.xml\` at \`${sitemapUrl}\`.`,
        '- Confirm the home page returns HTTP 200, uses HTTPS, and does not contain `noindex`.',
        '- Verify the domain property in Google Search Console.',
        '- Open the Sitemaps report, add the sitemap URL, and submit it.',
        '- Use URL Inspection to request a recrawl after publishing changes.',
        '- Run the Rich Results Test if you add structured data.',
        '- Check PageSpeed Insights before campaigns or important launches.',
        '',
        'Notes:',
        '- Google can crawl well-linked pages without a sitemap, but a sitemap helps discovery.',
        '- robots.txt controls crawling; it is not a security control or a replacement for noindex.',
        ''
      ].join('\n')
    },
    {
      path: 'legal/privacy-policy.md',
      language: 'markdown',
      content: buildPrivacyTemplate({ businessName, contactEmail, privacyUrl, today })
    },
    {
      path: 'legal/cookie-policy.md',
      language: 'markdown',
      content: buildCookieTemplate({ businessName, contactEmail, cookiesUrl, today })
    },
    {
      path: 'legal/legal-notice.md',
      language: 'markdown',
      content: buildTermsTemplate({ businessName, contactEmail, termsUrl, today })
    },
    {
      path: 'llms.txt',
      language: 'text',
      content: [`# ${siteName}`, '', `> ${description}`, '', `Site: ${origin}`, `Sitemap: ${sitemapUrl}`, `Contact: ${contactEmail}`, ''].join('\n')
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
      content: ['google-site-verification: REPLACE-THIS-TOKEN.html', ''].join('\n')
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

export function defaultContactEmailForUrl(url) {
  const hostname = new URL(url).hostname.replace(/^www\./i, '');
  return `hello@${hostname}`;
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
    `# Privacy Policy for ${businessName}`,
    '',
    `Last updated: ${today}`,
    '',
    '> Starter template. Review it with legal advice before publishing.',
    '',
    `${businessName} processes the personal data needed to answer requests, provide services, manage communications, and meet legal obligations.`,
    '',
    '## Controller',
    '',
    `- Controller: ${businessName}`,
    `- Contact: ${contactEmail}`,
    `- URL: ${privacyUrl}`,
    '',
    '## Data We May Process',
    '',
    '- Identity and contact details sent through forms or email.',
    '- Technical browsing data needed for security and operation.',
    '- Analytics or marketing data only when a valid legal basis or consent applies.',
    '',
    '## Rights',
    '',
    'You can request access, correction, deletion, objection, restriction, or portability by contacting the address above.',
    ''
  ].join('\n');
}

function buildCookieTemplate({ businessName, contactEmail, cookiesUrl, today }) {
  return [
    `# Cookie Policy for ${businessName}`,
    '',
    `Last updated: ${today}`,
    '',
    '> Starter template. Match this page to the cookies actually used by the site.',
    '',
    'This site may use essential cookies for operation and, when enabled, analytics, personalization, or advertising cookies.',
    '',
    '## Cookie Management',
    '',
    'Users can accept, reject, or configure non-essential cookies from the banner or preference panel when applicable.',
    '',
    '## Contact',
    '',
    `- Controller: ${businessName}`,
    `- Contact: ${contactEmail}`,
    `- URL: ${cookiesUrl}`,
    ''
  ].join('\n');
}

function buildTermsTemplate({ businessName, contactEmail, termsUrl, today }) {
  return [
    `# Legal Notice for ${businessName}`,
    '',
    `Last updated: ${today}`,
    '',
    '> Starter template. Add real tax, address, registration, and service details before publishing.',
    '',
    '## Site Owner',
    '',
    `- Owner: ${businessName}`,
    `- Contact: ${contactEmail}`,
    `- URL: ${termsUrl}`,
    '',
    '## Site Use',
    '',
    'Users agree to use the site lawfully and avoid actions that could damage, disable, or overload the service.',
    '',
    '## Intellectual Property',
    '',
    `Site content, brands, and assets belong to ${businessName} or their respective owners unless stated otherwise.`,
    ''
  ].join('\n');
}
