---
name: interseo
description: Audit and improve technical SEO from the interseo CLI and MCP server. Use when Codex needs to inspect a domain for DNS, speed, sitemap, robots.txt, metadata, policies, indexability, internal crawl issues, Search Console readiness, or generate Google-ready files such as robots.txt, sitemap.xml, JSON-LD, llms.txt, legal templates, reports, and MCP configuration. Trigger for requests that prefer CLI-only SEO automation or MCP SEO tools.
---

# interseo

Use interseo as a CLI-first SEO auditor. The normal input is only a domain and a site name; contact email is derived automatically as `contacto@domain`.

## Workflow

1. From the interseo repo, run `node src/cli.js <domain> "<site name>"` for the default fast audit.
2. Add `--save` to write the generated SEO kit.
3. Add `--deep` for a broader crawl or `--full` for the largest built-in crawl.
4. Use `npm.cmd run mcp` or `node src/mcp.js` when an MCP client should call interseo tools.
5. Read `references/seo-checks.md` when you need scoring categories or output interpretation.

## CLI

```powershell
node src/cli.js example.com "Example"
node src/cli.js example.com "Example" --save
node src/cli.js example.com "Example" --deep
node src/cli.js kit example.com "Example" --save
```

## MCP

```json
{
  "mcpServers": {
    "interseo": {
      "command": "node",
      "args": ["C:\\Users\\sigma\\Desktop\\seomax\\src\\mcp.js"]
    }
  }
}
```

Available MCP tools:

- `audit_site`: full audit with DNS, crawl, score, reports, and kit.
- `generate_seo_kit`: generate files without crawling.
- `analyze_html`: inspect raw HTML.
- `build_report`: convert audit JSON to Markdown and CSV reports.

## Output Standards

Prioritize blocking issues first: DNS not resolving, inaccessible home, noindex, robots blocking, missing sitemap, broken internal links, slow response, bad canonical, duplicate titles, thin pages, missing legal trust pages, and Search Console submission steps.

Do not claim Google submission is complete unless a verified Search Console property and submitted sitemap are confirmed by the user or tooling.