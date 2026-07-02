---
name: interseo
description: Audit the SEO of a website's source code (a local folder of HTML) without network access, and generate Google-ready SEO files. Use when Codex needs to check titles, descriptions, H1s, canonical, noindex, robots.txt, sitemap.xml, legal pages, thin content, or broken internal links in a web project before deploying, in CI, or to fix SEO issues file by file via the interseo CLI or MCP server.
---

# interseo

interseo audits the **source code** of a website — a local folder of HTML — with zero network access. Every finding references a real file path, so you can fix the files directly and re-run to confirm. It also generates the SEO assets a project usually lacks (robots.txt, sitemap.xml, JSON-LD, legal templates). Zero dependencies, Node 20+. Licensed for noncommercial use (PolyForm Noncommercial 1.0.0).

## Getting interseo

This skill is portable: any agent can use it without a pre-existing checkout.

- **Easiest from anywhere**: run `node scripts/run_interseo.mjs <args>` from this skill's folder. It finds the engine automatically — `INTERSEO_HOME`, an explicit path as first argument, the skill's own repo layout — and if none exists it clones `https://github.com/InterLarp/interseo.git` into `~/.interseo/repo` (needs git).
- **Manual**: `git clone https://github.com/InterLarp/interseo` and run `node interseo/src/cli.js`.
- **Pin a checkout**: set `INTERSEO_HOME=<path-to-repo>`. To update a cached clone: `git -C ~/.interseo/repo pull`.

## Workflow

1. Locate the folder with the final HTML (`dist/`, `public/`, `build/`, or the project root).
2. Run the audit: `node src/cli.js source <dir> --base <site-url>` (or `node scripts/run_interseo.mjs source <dir> --base <site-url>` from the skill folder).
3. Read `priority`: each check has `evidence` and `recommendation`; `--prompt` prints a fix prompt listing the exact files to edit.
4. Edit the flagged files in the repo, keeping the project's style.
5. Generate missing assets with `node src/cli.js kit <site-url> --save` and place them in the publishable folder.
6. Re-run the audit and compare scores. Repeat until clean.

```powershell
node src/cli.js source ./dist --base https://example.com
node src/cli.js source ./public --prompt
node src/cli.js source . --json
node src/cli.js kit example.com --save --lang es
```

`source` is the default command: `node src/cli.js ./dist` works too.

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

Tools (parameters in `references/cli-and-mcp.md`; failures come back in-band with `isError: true`):

- `audit_source` — audit a local HTML folder; findings reference file paths.
- `generate_seo_kit` — generate robots/sitemap/JSON-LD/legal files for a URL.
- `analyze_html` — inspect raw HTML you already have.

Typical chain: `audit_source` → fix flagged files → `generate_seo_kit` for whatever is missing → `audit_source` again to confirm the score improved.

## Interpreting results

- `score` is 0-100; grades: Excelente (≥90), Bueno (≥75), Mejorable (≥60), Crítico (<60).
- `priority` lists failing checks sorted by lost points — work top-down.
- `brokenLinks` includes the source file of each broken internal link, checked statically against the files that actually exist.
- `pages` has the per-file analysis (title, description, H1 count, word count, noindex...).
- Scoring categories and check details: `references/seo-checks.md`.

## Output standards

Fix blocking issues first: missing pages, robots.txt blocking everything, missing sitemap, `noindex` on pages meant to rank, broken internal links, then per-page metadata and content.

Never invent legal content: use the generated templates and mark the fields the user must complete. If the user needs live checks (DNS, HTTPS, response times, Search Console), say that interseo audits source code only and those must be verified after deploying.
