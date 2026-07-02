---
name: interseo
description: Use this skill to audit and fix SEO from local source files only. It should inspect the publishable HTML folder, edit files directly, generate missing SEO assets, and run the audit again without starting a web server or using network checks.
---

# interseo

interseo audits a website's **source code** without touching the network. The normal workflow is file-first: find the publishable HTML folder, run the source audit, fix the files, generate missing SEO assets, and run the audit again.

Do not start a dev server, browser, preview server, crawler, or live URL check for the normal skill workflow. interseo is built to inspect files on disk.

## Default Workflow

1. Find the folder that contains final HTML: `dist/`, `public/`, `build/`, `out/`, or the project root.
2. Run Site Audit against that folder with the skill runner.
3. Read `priority`, `fixPrompt`, and the file paths in the result.
4. Edit the source files directly.
5. Generate missing assets only when needed: robots.txt, sitemap.xml, JSON-LD, legal templates, llms.txt, humans.txt, or security.txt.
6. Run Site Audit again to confirm the score and findings changed.

## Commands

From the skill folder:

```powershell
node scripts/run_interseo.mjs source <dir> --base <site-url>
node scripts/run_interseo.mjs source <dir> --prompt
node scripts/run_interseo.mjs kit <site-url> --save
```

If no local install exists, the runner checks `INTERSEO_HOME`, the repo layout, or clones the engine into `~/.interseo/repo`.

## Tools

- `source` / Site Audit: audits a folder with HTML files on disk
- `kit` / SEO Starter Kit: generates SEO files for a site URL
- `analyze_html` / HTML Snapshot: inspects raw HTML when used through MCP

MCP is an optional integration surface for clients that already use MCP. Do not start the MCP server just to audit a project with this skill.

## What It Returns

- findings with real file paths
- prioritized repairs
- score and grade
- a repair prompt with the exact files to edit

## Good Defaults

- Fix crawl, indexation, and navigation blockers first.
- Keep changes in the project files; do not rely on live server behavior.
- Do not invent legal content; use templates as a base and fill in real details.
- Run live checks such as DNS, HTTPS, performance, and Search Console only after publishing.
