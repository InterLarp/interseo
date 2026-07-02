import { cleanText, escapeHtml, escapeXml, normalizeComparableUrl, normalizeUrl } from './analyzer.js';

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

export function defaultContactEmailForUrl(url) {
  const hostname = new URL(url).hostname.replace(/^www\./i, '');
  return `contacto@${hostname}`;
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
