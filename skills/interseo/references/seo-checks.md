# interseo — SEO checks reference

## Scoring categories

The audit score is split across these categories, each with its own weight. The overall grade is Excelente (≥90), Bueno (≥75), Mejorable (≥60), or Crítico (<60).

- **Infra** — DNS resolution and latency, A/AAAA records, IPv6, nameservers, SPF and DMARC.
- **Rastreo** — URL access over HTTPS, robots.txt, sitemap, canonical, redirects.
- **Contenido** — title, meta description, viewport, language, H1, internal links, image alt text.
- **Indexación** — noindex, X-Robots-Tag, structured data, Open Graph, Twitter Cards, hreflang, favicon.
- **Confianza** — privacy policy, cookie policy, legal/terms page, contact or about page, mixed content.
- **Google** — sitemap declared in robots.txt, sitemap includes the home URL, useful Schema.org type, Search Console readiness.
- **Crawler** — breadth-first internal crawl that follows discovered links up to the page limit: HTTP errors, duplicate titles and descriptions, thin content, broken internal links. `crawl.discoveredCount` reports how many unique internal URLs were found (crawled or not).
- **Rendimiento** — response time and redirect control.

## Priority order when fixing

1. Make DNS resolve quickly with valid A or AAAA records.
2. Make the home return HTTP 200 over HTTPS without login.
3. Remove `noindex` and blocking `X-Robots-Tag` from pages meant to rank.
4. Ensure `robots.txt` does not block `/` for `*` or Googlebot.
5. Publish `sitemap.xml` and declare it in `robots.txt`.
6. Fix canonical, title, description, H1, and thin content.
7. Fix broken internal links and duplicate metadata found by the crawl.
8. Add JSON-LD, social metadata, trust pages, SPF/DMARC, and complete the Search Console checklist.

## Generated kit

Depending on the entry point, the kit includes: `robots.txt`, `sitemap.xml`, `seo-head-snippet.html`, `structured-data.jsonld`, the Search Console checklist, legal templates, `llms.txt`, `humans.txt`, `.well-known/security.txt`, `google-site-verification.html`, an MCP config, the Markdown report, checks and pages CSVs, a compact audit JSON, and the three fix prompts (skill, MCP, direct).
