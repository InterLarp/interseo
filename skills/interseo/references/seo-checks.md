# interseo SEO Checks

## Categories

- Infra: DNS resolution, DNS latency, IPv6, nameservers, SPF and DMARC.
- Rastreo: URL access, HTTPS, robots.txt, sitemap, canonical, redirects.
- Contenido: title, meta description, viewport, language, H1, internal links, image alt text.
- Indexacion: noindex, X-Robots-Tag, structured data, Open Graph, Twitter Cards, hreflang, favicon.
- Confianza: privacy policy, cookie policy, legal or terms page, contact/about page, security headers, mixed content.
- Google: sitemap in robots.txt, sitemap home URL, useful Schema.org type, Search Console readiness.
- Crawler: internal crawl coverage, HTTP errors, duplicate titles/descriptions, broken internal links.
- Rendimiento: response time and redirect control.

## Priority Order

1. Make DNS resolve quickly with valid A or AAAA records.
2. Make the home return HTTP 200 over HTTPS without login.
3. Remove `noindex` and blocking `X-Robots-Tag` from pages intended to rank.
4. Ensure `robots.txt` does not block `/` for `*` or Googlebot.
5. Publish `sitemap.xml` and declare it in `robots.txt`.
6. Fix canonical, title, description, H1, and thin content.
7. Fix broken internal links and duplicate metadata discovered by crawl.
8. Add JSON-LD, social metadata, trust pages, SPF/DMARC, and Search Console checklist.

## Generated Kit

The kit may include `robots.txt`, `sitemap.xml`, `seo-head-snippet.html`, `structured-data.jsonld`, Search Console checklist, legal templates, `llms.txt`, `humans.txt`, `.well-known/security.txt`, MCP config, Markdown report, CSV checks, CSV pages, and compact audit JSON.