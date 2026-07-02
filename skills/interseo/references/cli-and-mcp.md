# interseo CLI and MCP Reference

## CLI

```powershell
node src/cli.js [command] <folder|url> [flags]
```

If no command is given, `source` runs.

## Commands

| Command | Human name | What it does |
| --- | --- | --- |
| `source` | Site Audit | Audits a local folder of HTML without network access |
| `kit` | SEO Starter Kit | Generates SEO files for a URL without network access |

## `source` Flags

| Flag | Description |
| --- | --- |
| `--base <url>` | Site base URL used to resolve absolute internal links |
| `--limit <n>` | Maximum HTML files to analyze, default 200 |
| `--prompt` | Prints a repair prompt listing exact files to edit |
| `--json` | Prints the full audit result as JSON |

## `kit` Flags

| Flag | Description |
| --- | --- |
| `--save` | Writes generated files to disk |
| `--out <dir>` | Output folder, default `generated/<site>` |
| `--name <name>` | Site or brand name |
| `--description <text>` | Short site description |
| `--businessName <name>` | Legal or business name for templates |
| `--lang <code>` | Language code for WebSite structured data |
| `--urls <list>` | Comma-separated URLs for sitemap.xml |

## General Flags

`--help` and `-h` print usage. `--version` prints the version. Boolean flags such as `--save`, `--json`, and `--prompt` never consume the next argument.

Reports go to stdout, notices go to stderr, and exit code `1` means the target is missing or the operation failed.

## MCP Tools

Server: `node src/mcp.js` over stdio using JSON-RPC protocol `2025-06-18`. No tool touches the network. Tool failures return `isError: true`; unknown tools or methods return JSON-RPC errors.

### `audit_source`

Human name: Site Audit

| Param | Type | Description |
| --- | --- | --- |
| `dir` required | string | Folder with publishable HTML |
| `baseUrl` | string | Site base URL used to resolve absolute internal links |
| `pageLimit` | number | Maximum HTML files to analyze, default 200 |

Returns score, grade, prioritized checks, totals, broken links, sitemap URLs without files, orphan pages, per-page analysis, a repair prompt, and a Markdown report. Sitemap indexes are detected, and self-links do not hide orphan pages.

### `generate_seo_kit`

Human name: SEO Starter Kit

| Param | Type | Description |
| --- | --- | --- |
| `url` required | string | Canonical website URL |
| `siteName` | string | Site or brand name |
| `description` | string | Short site description |
| `businessName` | string | Legal or business name |
| `lang` | string | Language code for structured data |
| `discoveredUrls` | string[] | Same-origin URLs for sitemap.xml |

Returns `{ siteName, origin, generatedAt, files[] }`. Each file includes `path`, `language`, and `content`.

### `analyze_html`

Human name: HTML Snapshot

| Param | Type | Description |
| --- | --- | --- |
| `html` required | string | Raw HTML source |
| `url` required | string | Page URL used to resolve relative links |

Returns metadata, headings, links, images missing alt text, JSON-LD types, Open Graph, Twitter Cards, hreflang, mixed content, and word count.