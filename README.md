# interseo

SEO checks for source code. Built for agents that need to inspect a static site, find the files that matter, and fix the project without guessing.

interseo works offline. Give it the folder that contains the final HTML and it reports issues with real file paths: missing metadata, weak page structure, broken internal links, sitemap problems, orphan pages, legal gaps, and the SEO files a site usually forgets.

## Use it with an AI agent

Ask your agent to use the `interseo` skill and make the fixes directly in the repository.

```text
Use the interseo skill. Audit the publishable HTML, fix the SEO issues in the source files, generate the missing SEO assets, and run the audit again.
```

The skill is included in this repo at [skills/interseo](skills/interseo).

```powershell
npm run skill:install
```

## Use it through MCP

interseo also runs as an MCP server for editors and coding agents that support tool servers.

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

Tools:

- `audit_source` checks a local HTML folder and returns file-level findings
- `generate_seo_kit` creates robots, sitemap, JSON-LD, legal templates, llms.txt, humans.txt, and security.txt
- `analyze_html` inspects a single HTML string

Full MCP reference: [docs/mcp.md](docs/mcp.md).

## What it checks

- titles, descriptions, H1s, language, viewport, canonical links, and noindex
- image alt text, thin content, mixed content, Open Graph, Twitter Cards, JSON-LD, favicon, and charset
- robots.txt, sitemap.xml, sitemap URLs, broken internal links, and orphan pages
- legal pages, contact pages, duplicate titles, duplicate descriptions, and meta refresh redirects

## What it generates

- `robots.txt`
- `sitemap.xml`
- `seo-head-snippet.html`
- `structured-data.jsonld`
- `google-search-console-checklist.md`
- `llms.txt`
- `humans.txt`
- `.well-known/security.txt`
- `legal/` templates for privacy, cookies, and legal notice

Legal templates are starting points. Fill them with real business details before publishing.

## Project map

```text
src/analyzer.js          HTML, robots, and sitemap parsing
src/source-auditor.js    folder-level SEO audit
src/kit.js               SEO asset generator
src/mcp.js               MCP server
skills/interseo/         portable agent skill
docs/mcp.md              MCP reference
```

## License

PolyForm Noncommercial 1.0.0. See [LICENSE](LICENSE).
