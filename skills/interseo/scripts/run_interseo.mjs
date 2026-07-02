import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_URL = 'https://github.com/InterLarp/interseo.git';
const BOOLEAN_FLAGS = new Set(['save', 'json', 'prompt', 'help', 'version']);

let args = process.argv.slice(2);
let repo = '';

if (process.env.INTERSEO_HOME && isRepo(path.resolve(process.env.INTERSEO_HOME))) {
  repo = path.resolve(process.env.INTERSEO_HOME);
}

if (!repo && args[0] && isRepo(path.resolve(args[0]))) {
  repo = path.resolve(args[0]);
  args = args.slice(1);
}

if (!repo) {
  const local = path.resolve(__dirname, '..', '..', '..');
  if (isRepo(local)) repo = local;
}

if (!repo) {
  const cache = path.join(os.homedir(), '.interseo', 'repo');
  if (!isRepo(cache)) {
    console.error(`interseo not found. Downloading into ${cache}...`);
    const clone = spawnSync('git', ['clone', '--depth', '1', REPO_URL, cache], {
      stdio: 'inherit',
      shell: false
    });
    if (clone.status !== 0 || !isRepo(cache)) {
      console.error('Could not download interseo. Install git or set INTERSEO_HOME to an interseo checkout.');
      process.exit(1);
    }
  }
  repo = cache;
}

const pkg = JSON.parse(readFileSync(path.join(repo, 'package.json'), 'utf8'));
const known = new Set(['source', 'kit']);
const command = known.has(args[0]) ? args.shift() : 'source';
const flags = parseFlags(args);
const target = flags._[0];
const name = flags.name || flags.siteName || flags._.slice(1).join(' ');

if (flags.version) {
  console.log(pkg.version);
  process.exit(0);
}

if (flags.help || !target) usage(flags.help ? 0 : 1);

try {
  if (command === 'source') {
    const { auditSource } = await import(pathToFileURL(path.join(repo, 'src', 'source-auditor.js')).href);
    const result = await auditSource({ dir: path.resolve(process.cwd(), target), baseUrl: flags.base || flags.baseUrl, pageLimit: flags.limit });
    if (flags.prompt) {
      console.log(result.fixPrompt);
    } else if (flags.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(result.report);
    }
  }

  if (command === 'kit') {
    const { buildGeneratedKit } = await import(pathToFileURL(path.join(repo, 'src', 'kit.js')).href);
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
  print(`interseo ${pkg.version} skill runner

Usage: node scripts/run_interseo.mjs [source|kit] <folder|url> [flags]

This runner calls interseo modules directly. It does not start a dev server, browser, crawler, or live URL check.

Actions:
  source   run Site Audit on local HTML files (default)
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

Examples:
  node scripts/run_interseo.mjs source ./dist --base https://example.com
  node scripts/run_interseo.mjs source ./public --prompt
  node scripts/run_interseo.mjs kit example.com --save`);
  process.exit(exitCode);
}

function isRepo(dir) {
  return Boolean(dir) && existsSync(path.join(dir, 'src', 'source-auditor.js')) && existsSync(path.join(dir, 'src', 'kit.js'));
}