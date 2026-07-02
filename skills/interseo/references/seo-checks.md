# interseo SEO Checks Reference

## Scoring Categories

The score is split across five categories. The overall grade is Excellent (90+), Good (75+), Needs Work (60+), or Critical (below 60).

- **Crawl**: HTML pages found, robots.txt present, robots.txt not blocking everything, sitemap.xml present and valid, sitemap URLs mapped to files.
- **Content**: titles, unique titles, descriptions, unique descriptions, H1s, language, viewport, image alt text, and thin content.
- **Indexing**: canonical links, unexpected noindex tags, meta refresh redirects, structured data, Open Graph, and favicon.
- **Trust**: privacy, cookie, legal, contact, and about pages, plus no HTTP resources on HTTPS pages.
- **Links**: internal links resolve to files that actually exist, such as `/about` mapping to `about.html` or `about/index.html`.

Per-page checks scale like this: full points when no pages are affected, half points when up to 20% of pages are affected, and zero above that.

## Fix Order

1. Confirm the audited folder contains the final HTML, such as `dist/`, `public/`, `build/`, or the project root.
2. Remove global `Disallow: /` rules from robots.txt unless the environment must stay unindexed.
3. Add robots.txt and sitemap.xml when missing. `generate_seo_kit` can produce both.
4. Remove noindex from pages that should rank.
5. Fix broken internal links. Each finding names the source file and missing target.
6. Add missing titles, descriptions, and H1s file by file.
7. Deduplicate repeated titles and descriptions.
8. Add language, viewport, canonical links, image alt text, JSON-LD, Open Graph, favicon, and legal/contact pages.

## Result Shape

`audit_source` returns `score`, `grade`, `categories`, `checks`, `priority`, `totals`, `brokenLinks`, `sitemapMissingFiles`, `orphanPages`, `pages`, `fixPrompt`, and `report`.

Each check includes `id`, `category`, `status`, `points`, `max`, `evidence`, and `recommendation`.

## Generated Kit

`generate_seo_kit` produces robots.txt, sitemap.xml, seo-head-snippet.html, structured-data.jsonld, Search Console checklist, legal templates, llms.txt, humans.txt, `.well-known/security.txt`, google-site-verification.html, and MCP config.

Legal templates are starter content. Complete them with real business details before publishing.
