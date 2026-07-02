# MCP Server

`src/mcp.js` exposes interseo as an MCP server over stdio. It does not use the network and has no runtime dependencies.

Tool failures are returned in-band with `isError: true`.

## Start

```powershell
npm run mcp
node src/mcp.js
```

Client configuration:

```json
{
  "mcpServers": {
    "interseo": {
      "command": "node",
      "args": ["<path-to-interseo>/src/mcp.js"]
    }
  }
}
```

## Agent Workflow

1. Run `audit_source` on the folder that contains the publishable HTML.
2. Fix the files listed in `priority` and `fixPrompt`.
3. Run `generate_seo_kit` for missing assets like robots, sitemap, JSON-LD, and legal templates.
4. Run `audit_source` again and compare the score.

## Tools

### `audit_source`

Human name: **Site Audit**

Audits a local HTML folder and returns findings with real file paths.

Parameters:

- `dir` required: folder with the publishable HTML
- `baseUrl`: site URL used to resolve absolute internal links
- `pageLimit`: maximum HTML files to analyze, default 200

Returns:

- `score` and `grade`
- `checks` and `priority`
- `totals`
- `brokenLinks`
- `sitemapMissingFiles`
- `orphanPages`
- `pages`
- `fixPrompt`
- `report`

### `generate_seo_kit`

Human name: **SEO Starter Kit**

Generates SEO assets for a URL: robots.txt, sitemap.xml, head snippet, JSON-LD, Search Console checklist, legal templates, `llms.txt`, `humans.txt`, `security.txt`, and MCP config.

Parameters:

- `url` required: canonical site URL
- `siteName`: site or brand name
- `description`: short site description
- `businessName`: legal or business name
- `lang`: language code for WebSite structured data
- `discoveredUrls`: same-origin URLs to include in the sitemap

Returns `{ siteName, origin, generatedAt, files[] }`, where each file contains `{ path, language, content }`.

### `analyze_html`

Human name: **HTML Snapshot**

Inspects raw HTML: metadata, headings, links, images, JSON-LD, Open Graph, Twitter Cards, hreflang, and mixed content.

Parameters:

- `html` required: HTML source
- `url` required: page URL used to resolve relative links
