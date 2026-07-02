# interseo — CLI and MCP reference

## CLI

```
node src/cli.js [command] <folder|url> [flags]
```

If no command is given, `source` runs.

### Commands

| Command | What it does | Output |
| --- | --- | --- |
| `source` (default) | Audit a local folder of HTML, no network | Markdown report (`--json` full result, `--prompt` fix prompt with file paths) |
| `kit` | Generate the SEO file kit for a URL, no network | Kit JSON (files written with `--save`) |

### `source` flags

| Flag | Description |
| --- | --- |
| `--base <url>` | Site base URL to resolve absolute internal links (default `https://example.com`) |
| `--limit <n>` | Max HTML files to analyze (default 200) |
| `--prompt` | Print a fix prompt listing the exact files to edit |
| `--json` | Print the full audit result as JSON |

### `kit` flags

| Flag | Description |
| --- | --- |
| `--save` | Write the generated files to disk |
| `--out <dir>` | Output folder (default `generated/<site>`) |
| `--name <name>` | Site name |
| `--description <text>` | Short site description |
| `--businessName <name>` | Legal business name for templates |
| `--lang <code>` | Language code for the WebSite structured data |
| `--urls <list>` | Comma-separated URLs for the sitemap |

### General flags

`--help`/`-h` prints usage; `--version` prints the version. Boolean flags (`--save`, `--json`, `--prompt`) never consume the next argument. Reports go to stdout, notices to stderr; exit code is 1 on missing target or failure.

## MCP tools

Server: `node src/mcp.js` (stdio, JSON-RPC, protocol `2025-06-18`). No tool touches the network. Tool execution failures return `isError: true` in the tool result; unknown tools/methods return JSON-RPC errors.

### `audit_source`

| Param | Type | Description |
| --- | --- | --- |
| `dir` (required) | string | Folder with the publishable HTML (`dist/`, `public/`, project root) |
| `baseUrl` | string | Site base URL to resolve absolute internal links |
| `pageLimit` | number | Max HTML files to analyze (default 200) |

Returns: `score` (0-100) and `grade`, prioritized `checks` with `evidence` and `recommendation`, `totals` per issue type, `brokenLinks` with the source file of each, per-page `pages` analysis, `fixPrompt` (file-level fix prompt) and `report` (Markdown).

### `generate_seo_kit`

| Param | Type | Description |
| --- | --- | --- |
| `url` (required) | string | Canonical website URL |
| `siteName` | string | Optional name; domain used if omitted |
| `description` | string | Short site description |
| `businessName` | string | Legal business name |
| `lang` | string | Language code for the WebSite structured data |
| `discoveredUrls` | string[] | Same-origin URLs for sitemap.xml |

Returns: `{ siteName, origin, generatedAt, files[] }` where each file is `{ path, language, content }`. Files include robots.txt, sitemap.xml (home gets priority 1.0/daily), seo-head-snippet.html, structured-data.jsonld (Organization + WebSite `@graph`), Search Console checklist, legal templates, llms.txt, humans.txt, security.txt and MCP config.

### `analyze_html`

| Param | Type | Description |
| --- | --- | --- |
| `html` (required) | string | Raw HTML source |
| `url` (required) | string | Page URL, used to resolve relative links (honors `<base href>`) |

Returns: title, description, canonical, lang, headings, links (internal/external), images missing alt, JSON-LD types, Open Graph, Twitter Cards, hreflang, mixed content, word count.
