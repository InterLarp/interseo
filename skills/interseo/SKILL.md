---
name: interseo
description: Use this skill to audit and fix the SEO of a website's source code without network access, generate Google-ready SEO files, and guide an agent to apply the changes directly in the repository.
---

# interseo

interseo audits a website's **source code** without touching the network. Use the skill, inspect the publishable HTML, fix the source files, and validate again. It also generates the SEO assets sites often miss: robots.txt, sitemap.xml, JSON-LD, and legal templates.

## How to Use This Skill

- Ask the agent to use `interseo`, audit the site, and apply the fixes directly in the repository.
- Work against the folder that contains final HTML: `dist/`, `public/`, `build/`, or the project root.
- For automation, use the skill runner or connect the MCP server.

## Quick Start

From the skill folder:

```powershell
node scripts/run_interseo.mjs source <dir> --base <site-url>
node scripts/run_interseo.mjs source <dir> --prompt
node scripts/run_interseo.mjs kit <site-url> --save
```

If no local install exists, the runner checks `INTERSEO_HOME`, the repo layout, or clones the engine into `~/.interseo/repo`.

## MCP

Client entry:

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

Tools:

- `audit_source` / Site Audit: audits a folder with HTML
- `generate_seo_kit` / SEO Starter Kit: generates robots, sitemap, JSON-LD, and legal templates
- `analyze_html` / HTML Snapshot: inspects raw HTML

## What It Returns

- findings with real file paths
- prioritized repairs
- score and grade
- a repair prompt with the exact files to edit

## Reading Results

- `priority` sorts issues by impact
- `brokenLinks` shows the file where each broken link was found
- `orphanPages` shows pages that are not connected
- `pages` summarizes metadata and gaps for each file

## Good Defaults

- Fix crawl, indexation, and navigation blockers first.
- Do not invent legal content; use templates as a base and fill in real details.
- Run live checks such as DNS, HTTPS, performance, and Search Console after publishing.
