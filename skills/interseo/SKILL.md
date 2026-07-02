---
name: interseo
description: Audit and improve technical SEO from the interseo CLI and MCP server with domain-only input. Use when Codex needs to inspect a domain for DNS, speed, sitemap, robots.txt, metadata, policies, indexability, internal crawl issues, Search Console readiness, infer the site name automatically, or generate Google-ready files and fix prompts for `$interseo`, MCP, or direct repository edits.
---

# interseo

interseo is a CLI-first SEO auditor with an MCP server. The normal input is just a domain: the site name is inferred from crawl metadata (title, H1, Open Graph) or the domain itself, and the legal contact email is derived as `contacto@domain`. It has zero dependencies and needs Node 20+. Licensed for noncommercial use (PolyForm Noncommercial 1.0.0).

## Getting interseo

This skill is portable: any agent can use it without a pre-existing checkout.

- **Easiest from anywhere**: run `node scripts/run_interseo.mjs <domain> [flags]` from this skill's folder. It finds the repo automatically — `INTERSEO_HOME`, an explicit path as first argument, the skill's own repo layout — and if none exists it clones `https://github.com/InterLarp/interseo.git` into `~/.interseo/repo` (needs git). All CLI commands and flags pass through.
- **Manual**: `git clone https://github.com/InterLarp/interseo` and run `node interseo/src/cli.js <domain>`.
- **Pin a checkout**: set `INTERSEO_HOME=<path-to-repo>` and the runner will always use it. To update a cached clone: `git -C ~/.interseo/repo pull`.

```powershell
node scripts/run_interseo.mjs example.com --save
node scripts/run_interseo.mjs prompt example.com
node scripts/run_interseo.mjs kit example.com --save
```

## Choosing the entry point

- **CLI** (`node src/cli.js` from the repo, or `node scripts/run_interseo.mjs` from anywhere) — default. Use for one-off audits, saving kits to disk, or printing fix prompts.
- **MCP** (`node src/mcp.js`) — use when a client should call tools programmatically, chain audits with fixes, reuse a previous audit JSON, or analyze raw HTML without fetching.
- **Source mode** (`source` command / `audit_source` tool) — audit a local folder of HTML **without network**. Best when the site is not deployed yet, for pre-deploy or CI checks, or when the user wants file-level fixes: every finding references a real file path you can edit directly.
- Full command, flag, and tool parameter tables: `references/cli-and-mcp.md`.
- Scoring categories, priority order, and kit contents: `references/seo-checks.md`.

## CLI workflow

1. From the interseo repo, run `node src/cli.js <domain>` for the default fast audit (5 pages).
2. Add `--save` to write the kit, reports, and prompts to `generated/<site>/`.
3. Add `--deep` (12 pages) or `--full` (20 pages) for broader crawls; `--limit <n>` for exact control.
4. Use `--prompt`, `--prompt=mcp`, `--prompt=direct`, or `node src/cli.js prompt <domain>` for a ready-to-paste fix prompt.
5. Use `node src/cli.js kit <domain> --save` to generate files without crawling (accepts `--description`, `--businessName`, `--urls`).
6. Use `--json` for the full machine-readable audit; the Markdown report is the default output.
7. `--help` prints the complete flag reference; `--version` prints the version.

```powershell
node src/cli.js example.com
node src/cli.js example.com --save --deep
node src/cli.js example.com --prompt=mcp
node src/cli.js prompt example.com
node src/cli.js kit example.com --save
node src/cli.js report example.com --full
node src/cli.js source ./dist --base https://example.com
node src/cli.js source ./public --prompt
```

For source mode: point it at the folder with the final HTML (`dist/`, `public/`, or the project root). Use `--prompt` to get a fix prompt listing the exact files to edit, then apply those edits yourself in the repo.

## MCP workflow

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

Typical tool chains:

- **Audit then fix**: `audit_site` → take fail/warn checks as backlog → apply repo changes → `audit_site` again to compare scores.
- **Fix prompt without re-crawling**: pass a previous audit to `generate_fix_prompt` as `audit` — no new network calls.
- **Offline analysis**: `analyze_html` for raw HTML you already have; `build_report` to turn any audit JSON into Markdown/CSV.
- **Bootstrap files**: `generate_seo_kit` when the site needs robots/sitemap/JSON-LD/legal pages and a crawl is unnecessary.
- **Local project audit**: `audit_source` with the project's HTML folder — no network, findings point at files; fix them, then re-run to confirm.

Tools: `audit_site`, `audit_source`, `generate_seo_kit`, `generate_fix_prompt`, `analyze_html`, `build_report` — parameters in `references/cli-and-mcp.md`. Tool failures come back in-band with `isError: true`, not as protocol errors.

## Interpreting results

- `score` is 0-100; grades: Excelente (≥90), Bueno (≥75), Mejorable (≥60), Crítico (<60).
- `priority` lists failing checks sorted by lost points — work top-down.
- `checks[].status` is `pass` / `warn` / `fail`; `evidence` explains what was observed, `recommendation` how to fix it.
- `crawl.totals` has duplicate titles/descriptions, thin content, noindex, and broken-link counts across crawled pages.
- `kit.files` contains every generated file (path + content) ready to write.

## Output standards

Report blocking issues first: DNS not resolving, inaccessible home, `noindex`, robots blocking, missing sitemap, broken internal links, slow response, bad canonical, duplicate titles, thin pages, missing legal trust pages, and pending Search Console steps.

When the user asks how to fix the results, hand them the generated prompt from `fixPrompts.skill`, `fixPrompts.mcp`, or the kit files under `prompts/`.

Never claim the Google submission is complete unless a verified Search Console property and a submitted sitemap are confirmed by the user or by tooling. If DNS changes are needed, describe the exact records to change at the DNS provider — do not pretend to have applied them.
