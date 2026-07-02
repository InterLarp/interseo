# interseo — CLI and MCP reference

## CLI

```
node src/cli.js [command] <domain> [site name] [flags]
```

The domain accepts bare hostnames (`example.com` → `https://example.com`). If no command is given, `audit` runs.

### Commands

| Command | What it does | Output |
| --- | --- | --- |
| `audit` (default) | Full audit: DNS, robots, sitemap, metadata, policies, crawl, score | Markdown report (or JSON with `--json`) |
| `prompt` | Audit, then print only the fix prompt | Prompt text |
| `kit` | Generate the file kit without crawling | Kit JSON (files written with `--save`) |
| `report` | Audit, print only the Markdown report | Markdown report |
| `source` | Audit a local folder of HTML, no network | Markdown report (`--json` full result, `--prompt` fix prompt with file paths) |

### Flags

| Flag | Applies to | Description |
| --- | --- | --- |
| `--save` | audit, kit | Write the generated kit to disk |
| `--out <dir>` | audit, kit | Output folder (default `generated/<site>`) |
| `--deep` | audit, prompt, report | Crawl up to 12 pages, probe 24 links |
| `--full` | audit, prompt, report | Crawl up to 20 pages, probe 40 links |
| `--limit <n>` | audit, report | Exact crawl page limit (default 5, max 40) |
| `--linkProbeLimit <n>` | audit | Exact broken-link probe limit (default 12) |
| `--prompt[=skill\|mcp\|direct]` | audit | Print the fix prompt instead of the report |
| `--json` | audit | Print the full audit result as JSON |
| `--name <name>` | all | Force the site name instead of inferring it |
| `--description <text>` | kit | Short site description for generated files |
| `--businessName <name>` | kit | Legal business name for templates |
| `--urls <list>` | kit | Comma-separated known URLs for the sitemap |
| `--help`, `-h` | — | Print full usage |
| `--version` | — | Print the version |

Boolean flags (`--save`, `--deep`, `--full`, `--json`, `--prompt`, `--help`, `--version`) never consume the next argument, so `--save example.com` works.

The report goes to stdout; notices (like the kit save path) go to stderr, so `node src/cli.js example.com --save > report.md` produces a clean file. Exit code is 1 on missing domain or audit failure.

## MCP tools

Server: `node src/mcp.js` (stdio, JSON-RPC, protocol `2025-06-18`). Tool execution failures return `isError: true` in the tool result; unknown tools/methods return JSON-RPC errors.

### `audit_site`

| Param | Type | Description |
| --- | --- | --- |
| `url` (required) | string | Website URL to audit |
| `siteName` | string | Optional name; inferred from crawl if omitted |
| `crawlLimit` | number | Same-origin pages to crawl (default 5, max 40) |
| `linkProbeLimit` | number | Internal URLs probed for broken links (default 12) |

Returns: score, grade, categories, prioritized checks, robots/sitemap/policies/DNS detail, crawl totals and pages, generated kit, reports, and fix prompts.

### `audit_source`

| Param | Type | Description |
| --- | --- | --- |
| `dir` (required) | string | Folder with the publishable HTML (`dist/`, `public/`, project root) |
| `baseUrl` | string | Site base URL to resolve absolute internal links |
| `pageLimit` | number | Max HTML files to analyze (default 200) |

No network access. Returns score, prioritized checks, per-page analysis, broken internal links with source file, `fixPrompt` (file-level fix prompt) and `report` (Markdown). Also add `--base <url>` to the CLI `source` command for the same purpose.

### `generate_seo_kit`

| Param | Type | Description |
| --- | --- | --- |
| `url` (required) | string | Canonical website URL |
| `siteName` | string | Optional name; domain used if omitted |
| `description` | string | Short site description |
| `businessName` | string | Legal business name |
| `lang` | string | Language code for the WebSite structured data |
| `discoveredUrls` | string[] | Same-origin URLs for sitemap.xml |

Returns: `{ siteName, origin, generatedAt, files[] }` where each file is `{ path, language, content }`.

### `generate_fix_prompt`

| Param | Type | Description |
| --- | --- | --- |
| `url` | string | URL to audit before generating the prompt |
| `mode` | `skill` \| `mcp` \| `direct` | Prompt style (default `skill`) |
| `audit` | object | Previous `audit_site` result — skips the new crawl |
| `crawlLimit` | number | Page limit if a fresh audit is needed (default 5) |
| `linkProbeLimit` | number | Link probe limit if a fresh audit is needed (default 12) |

Returns: `{ mode, prompt, prompts: {skill, mcp, direct}, issues[] }`.

### `analyze_html`

| Param | Type | Description |
| --- | --- | --- |
| `html` (required) | string | Raw HTML source |
| `url` (required) | string | Page URL, used to resolve relative links |

Returns: title, description, canonical, lang, headings, links (internal/external), images missing alt, JSON-LD types, Open Graph, Twitter Cards, hreflang, mixed content, word count.

### `build_report`

| Param | Type | Description |
| --- | --- | --- |
| `audit` (required) | object | Result returned by `audit_site` |

Returns: `{ markdown, checksCsv, pagesCsv, fixPrompt }`.
