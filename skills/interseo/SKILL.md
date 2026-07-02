---
name: interseo
description: Audit and improve technical SEO from the interseo CLI and MCP server with domain-only input. Use when Codex needs to inspect a domain for DNS, speed, sitemap, robots.txt, metadata, policies, indexability, internal crawl issues, Search Console readiness, infer the site name automatically, or generate Google-ready files and fix prompts for `$interseo`, MCP, or direct repository edits.
---

# interseo

Use interseo as a CLI-first SEO auditor. The normal input is only a domain; site name is inferred from crawl metadata, title, H1, Open Graph, or domain. Contact email is derived automatically as `contacto@domain`.

## Workflow

1. From the interseo repo, run `node src/cli.js <domain>` for the default fast audit.
2. Add `--save` to write the generated SEO kit, reports, and prompts.
3. Add `--prompt`, `--prompt=mcp`, or `node src/cli.js prompt <domain>` when the user wants a ready prompt to fix the site.
4. Add `--deep` for a broader crawl or `--full` for the largest built-in crawl.
5. Use `npm.cmd run mcp` or `node src/mcp.js` when an MCP client should call interseo tools.
6. Read `references/seo-checks.md` when you need scoring categories or output interpretation.

## CLI

```powershell
node src/cli.js example.com
node src/cli.js example.com --save
node src/cli.js example.com --deep
node src/cli.js example.com --prompt=mcp
node src/cli.js prompt example.com
node src/cli.js kit example.com --save
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

- `audit_site`: full audit with DNS, crawl, score, reports, prompts, and kit.
- `generate_seo_kit`: generate files without crawling.
- `generate_fix_prompt`: generate a ready-to-use fix prompt from a URL or audit JSON.
- `analyze_html`: inspect raw HTML.
- `build_report`: convert audit JSON to Markdown and CSV reports.

## Output Standards

Prioritize blocking issues first: DNS not resolving, inaccessible home, noindex, robots blocking, missing sitemap, broken internal links, slow response, bad canonical, duplicate titles, thin pages, missing legal trust pages, and Search Console submission steps.

When a user asks how to fix the result, provide the generated prompt from `fixPrompts.skill`, `fixPrompts.mcp`, or the kit file under `prompts/`.

Do not claim Google submission is complete unless a verified Search Console property and submitted sitemap are confirmed by the user or tooling.