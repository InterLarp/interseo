import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { buildGeneratedKit } from './kit.js';
import { auditSource } from './source-auditor.js';

const pkg = createRequire(import.meta.url)('../package.json');
const BOOLEAN_FLAGS = new Set(['save', 'json', 'prompt', 'help', 'version']);
const rawArgs = process.argv.slice(2);
const known = new Set(['source', 'kit']);
const command = known.has(rawArgs[0]) ? rawArgs.shift() : 'source';
const flags = parseFlags(rawArgs);
const target = flags._[0];
const name = flags.name || flags.siteName || flags._.slice(1).join(' ');

if (flags.version) {
  console.log(pkg.version);
  process.exit(0);
}

if (flags.help) usage(0);
if (!target) usage(1);

try {
  if (command === 'source') {
    const result = await auditSource({ dir: target, baseUrl: flags.base || flags.baseUrl, pageLimit: flags.limit });
    if (flags.prompt) {
      console.log(result.fixPrompt);
    } else if (flags.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(result.report);
    }
  }

  if (command === 'kit') {
    const kit = buildGeneratedKit({
      url: target,
      siteName: name,
      description: flags.description || '',
      businessName: flags.businessName || name,
      lang: flags.lang || '',
      discoveredUrls: flags.urls ? String(flags.urls).split(',').map((item) => item.trim()).filter(Boolean) : undefined
    });

    if (flags.save) {
      const dir = await saveFiles(kit.files, flags.out || `generated/${safeSlug(kit.siteName)}`);
      console.error(`SEO kit saved to ${dir}`);
    }

    console.log(JSON.stringify(kit, null, 2));
  }
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}

function parseFlags(values) {
  const out = { _: [] };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === '-h') {
      out.help = true;
      continue;
    }
    if (!value.startsWith('--')) {
      out._.push(value);
      continue;
    }

    const withoutPrefix = value.slice(2);
    const equalsIndex = withoutPrefix.indexOf('=');
    if (equalsIndex >= 0) {
      out[withoutPrefix.slice(0, equalsIndex)] = withoutPrefix.slice(equalsIndex + 1);
      continue;
    }

    if (BOOLEAN_FLAGS.has(withoutPrefix)) {
      out[withoutPrefix] = true;
      continue;
    }

    const next = values[index + 1];
    if (next && !next.startsWith('--')) {
      out[withoutPrefix] = next;
      index += 1;
    } else {
      out[withoutPrefix] = true;
    }
  }
  return out;
}

async function saveFiles(files, outDir) {
  const targetDir = path.resolve(outDir);
  for (const file of files || []) {
    const safePath = String(file.path || '').replace(/\\/g, '/').split('/').filter((part) => part && part !== '.' && part !== '..').join('/');
    if (!safePath) continue;
    const destination = path.resolve(targetDir, safePath);
    if (destination !== targetDir && !destination.startsWith(targetDir + path.sep)) continue;
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, String(file.content || ''), 'utf8');
  }
  return targetDir;
}

function safeSlug(value) {
  return String(value || 'interseo')
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'interseo';
}

function usage(exitCode = 1) {
  const print = exitCode === 0 ? console.log : console.error;
  print(`interseo ${pkg.version} - offline SEO audits for source code

Usage: node src/cli.js [command] <folder|url> [flags]

Commands:
  source   run Site Audit on a folder with HTML (default)
  kit      generate the SEO Starter Kit for a URL

Source flags:
  --base <url>              base URL used to resolve absolute internal links
  --limit <n>               maximum HTML files to analyze (default 200)
  --prompt                  print a repair prompt with file paths
  --json                    print the full result as JSON

Kit flags:
  --save                    write generated files to disk
  --out <dir>               output folder (default generated/<site>)
  --name <name>             site or brand name
  --description <text>      short site description
  --businessName <name>     legal or business name for templates
  --lang <code>             language code for structured data
  --urls <list>             sitemap URLs, comma-separated

General:
  --help, -h                show this help
  --version                 show the version

Examples:
  node src/cli.js source ./dist --base https://example.com
  node src/cli.js source ./public --prompt
  node src/cli.js kit example.com --save`);
  process.exit(exitCode);
}
