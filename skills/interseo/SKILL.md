---
name: interseo
description: Audit and improve technical SEO from the interseo CLI and MCP server with domain-only input. Use when Codex needs to inspect a domain for DNS, speed, sitemap, robots.txt, metadata, policies, indexability, internal crawl issues, Search Console readiness, infer the site name automatically, or generate Google-ready files and fix prompts for `$interseo`, MCP, or direct repository edits.
---

# interseo

interseo is a CLI-first SEO auditor. The normal input is just a domain: the site name is inferred from crawl metadata (title, H1, Open Graph) or the domain itself, and the legal contact email is derived as `contacto@domain`.

## Workflow

1. From the interseo repo, run `node src/cli.js <domain>` for the default fast audit.
2. Add `--save` to write the generated SEO kit, reports, and fix prompts to `generated/`.
3. Use `--prompt`, `--prompt=mcp`, or `node src/cli.js prompt <domain>` when the user wants a ready-to-paste prompt to fix the site.
4. Add `--deep` for a broader crawl (12 pages) or `--full` for the largest built-in crawl (20 pages).
5. Run `node src/mcp.js` when an MCP client should call interseo tools instead of the CLI.
6. Read `references/seo-checks.md` for scoring categories, priority order, and output interpretation.

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

Point the client at `src/mcp.js` inside the interseo repo:

```json
{
  "mcpServers": {
    "interseo": {
      "command": "node",
      "args": ["<path-to-interseo-repo>/src/mcp.js"]
    }
  }
}
```

Available tools:

- `audit_site` — full audit with DNS, crawl, score, reports, prompts, and kit.
- `generate_seo_kit` — generate the kit files without crawling.
- `generate_fix_prompt` — ready-to-use fix prompt from a URL or a previous audit JSON.
- `analyze_html` — inspect raw HTML.
- `build_report` — convert audit JSON to Markdown and CSV reports.

## Output standards

Report blocking issues first: DNS not resolving, inaccessible home, `noindex`, robots blocking, missing sitemap, broken internal links, slow response, bad canonical, duplicate titles, thin pages, missing legal trust pages, and pending Search Console steps.

When the user asks how to fix the results, hand them the generated prompt from `fixPrompts.skill`, `fixPrompts.mcp`, or the kit files under `prompts/`.

Never claim the Google submission is complete unless a verified Search Console property and a submitted sitemap are confirmed by the user or by tooling.
