# CLI Reference

The CLI is the small local interface used by the skill and scripts. Run it from the repo root with Node 20 or newer.

```powershell
node src/cli.js [command] <folder|url> [flags]
```

If no command is provided, `source` is used.

## Commands

### `source`

Human name: **Site Audit**

Audits a local HTML folder and returns an SEO report. The analysis stays offline.

```powershell
node src/cli.js source ./dist --base https://example.com
node src/cli.js ./public
node src/cli.js source . --prompt
node src/cli.js source ./dist --json
```

Flags:

- `--base <url>`: base URL used to resolve absolute internal links
- `--limit <n>`: maximum HTML files to analyze, default 200
- `--prompt`: prints a repair prompt with priority files and issues
- `--json`: prints the full result as JSON

The report covers title, description, H1, `lang`, viewport, canonical, noindex, image alt text, thin content, mixed content, robots.txt, sitemap.xml, legal pages, contact pages, duplicates, orphan pages, and broken links.

### `kit`

Human name: **SEO Starter Kit**

Generates SEO assets for a URL. It returns JSON and writes files to disk when `--save` is used.

```powershell
node src/cli.js kit example.com --save
node src/cli.js kit example.com --description "Independent design studio" --lang en --save
```

Flags:

- `--save`: writes generated files to disk
- `--out <dir>`: output folder, default `generated/<site>`
- `--name <name>`: site or brand name
- `--description <text>`: short site description
- `--businessName <name>`: legal or business name for templates
- `--lang <code>`: language code for structured data
- `--urls <list>`: known URLs, comma-separated, for the sitemap

## General Flags

- `--help`, `-h`: shows help
- `--version`: shows the version

Boolean flags do not consume the next argument. Reports go to `stdout`, errors go to `stderr`, and the exit code is `1` when the target is missing or the audit fails.
