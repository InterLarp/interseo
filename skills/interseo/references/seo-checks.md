# interseo — SEO checks reference (source audit)

## Scoring categories

The score is split across these categories. The overall grade is Excelente (≥90), Bueno (≥75), Mejorable (≥60), or Crítico (<60).

- **Rastreo** — HTML pages found, robots.txt present and not blocking everything, sitemap.xml present and valid.
- **Contenido** — per-page title, unique titles, meta description, unique descriptions, H1, `lang`, viewport, image alt text, thin content (under 120 words).
- **Indexación** — canonical per page, no unexpected `noindex`, JSON-LD on the home, Open Graph on the home, favicon.
- **Confianza** — legal pages (privacy, cookies, legal notice), contact/about page, no `http://` resources in pages.
- **Enlaces** — internal links resolve to files that actually exist (`/about` → `about.html` or `about/index.html`).

Per-page checks scale: full points with 0 affected pages, half if up to 20% of pages are affected, zero above that.

## Priority order when fixing

1. Make sure the audited folder contains the final HTML (`dist/`, `public/`, or the root).
2. Remove a global `Disallow: /` from robots.txt unless the environment must stay unindexed.
3. Add robots.txt and sitemap.xml if missing (`generate_seo_kit` produces both).
4. Remove `noindex` from pages meant to rank.
5. Fix broken internal links — each finding names the source file and the missing target.
6. Add missing titles, descriptions and H1s file by file; deduplicate repeated ones.
7. Declare `lang`, viewport and canonical on every page.
8. Expand thin content, add alt text, JSON-LD and Open Graph on the home, and the legal/contact pages.

## Result shape

`audit_source` returns `score`, `grade`, `categories`, `checks` (id, category, status pass/warn/fail, points, max, evidence, recommendation), `priority` (failing checks by lost points), `totals`, `brokenLinks` (`{file, href, target}`), `pages` (per-file analysis), `fixPrompt` and `report`.

## Generated kit

`generate_seo_kit` produces: robots.txt, sitemap.xml, seo-head-snippet.html, structured-data.jsonld, the Search Console checklist, legal templates, llms.txt, humans.txt, `.well-known/security.txt`, google-site-verification.html and an MCP config. Legal templates are orientative and must be completed with real data.
