import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { auditSite, buildGeneratedKit } from './auditor.js';
import { auditSource } from './source-auditor.js';

const pkg = createRequire(import.meta.url)('../package.json');
const BOOLEAN_FLAGS = new Set(['save', 'deep', 'full', 'json', 'prompt', 'help', 'version']);
const rawArgs = process.argv.slice(2);
const known = new Set(['audit', 'kit', 'report', 'prompt', 'source']);
const command = known.has(rawArgs[0]) ? rawArgs.shift() : 'audit';
const flags = parseFlags(rawArgs);
const domain = flags._[0];
const name = flags.name || flags.siteName || flags._.slice(1).join(' ');

if (flags.version) {
  console.log(pkg.version);
  process.exit(0);
}

if (flags.help) usage(0);
if (!domain) usage(1);

const crawlLimit = flags.full ? 20 : flags.deep ? 12 : flags.limit;
const linkProbeLimit = flags.full ? 40 : flags.deep ? 24 : flags.linkProbeLimit;

try {
  if (command === 'audit' || command === 'prompt') {
    const result = await auditSite({
      url: domain,
      siteName: name,
      crawlLimit,
      linkProbeLimit
    });

    if (flags.save) {
      const dir = await saveFiles(result.kit.files, flags.out || `generated/${safeSlug(result.kit.siteName)}`);
      console.error(`Kit guardado en ${dir}`);
    }

    if (command === 'prompt' || flags.prompt) {
      const promptType = flags.prompt === 'mcp' ? 'mcp' : flags.prompt === 'direct' ? 'direct' : 'skill';
      console.log(result.fixPrompts[promptType]);
      process.exit(0);
    }

    if (flags.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(result.reports.markdown);
    }
  }

  if (command === 'kit') {
    const kit = buildGeneratedKit({
      url: domain,
      siteName: name,
      description: flags.description || '',
      businessName: flags.businessName || name,
      discoveredUrls: flags.urls ? String(flags.urls).split(',').map((item) => item.trim()).filter(Boolean) : undefined
    });

    if (flags.save) {
      const dir = await saveFiles(kit.files, flags.out || `generated/${safeSlug(kit.siteName)}`);
      console.error(`Kit guardado en ${dir}`);
    }

    console.log(JSON.stringify(kit, null, 2));
  }

  if (command === 'report') {
    const result = await auditSite({ url: domain, siteName: name, crawlLimit, linkProbeLimit });
    console.log(result.reports.markdown);
  }

  if (command === 'source') {
    const result = await auditSource({ dir: domain, baseUrl: flags.base || flags.baseUrl, pageLimit: flags.limit });
    if (flags.prompt) {
      console.log(result.fixPrompt);
    } else if (flags.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(result.report);
    }
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
    const target = path.resolve(targetDir, safePath);
    if (target !== targetDir && !target.startsWith(targetDir + path.sep)) continue;
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, String(file.content || ''), 'utf8');
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
  print(`interseo ${pkg.version} - auditor de SEO tecnico

Uso: node src/cli.js [comando] <dominio> [nombre del sitio] [flags]

Comandos:
  audit    auditoria completa de un dominio (por defecto)
  prompt   auditar y devolver solo el prompt de arreglo
  kit      generar el kit de archivos sin rastrear
  report   auditar y mostrar solo el informe Markdown
  source   auditar el codigo fuente local de un sitio (carpeta con HTML)

Flags:
  --save                    guardar el kit generado en disco
  --out <dir>               carpeta de salida (por defecto generated/<sitio>)
  --deep                    crawl de hasta 12 paginas
  --full                    crawl de hasta 20 paginas
  --limit <n>               limite de paginas a rastrear
  --linkProbeLimit <n>      limite de enlaces internos a comprobar
  --prompt[=skill|mcp|direct]  imprimir el prompt de arreglo
  --json                    imprimir el resultado completo como JSON
  --name <nombre>           forzar el nombre del sitio
  --description <texto>     descripcion para el kit
  --businessName <nombre>   nombre legal para las plantillas
  --urls <lista>            URLs conocidas para el sitemap (separadas por comas)
  --base <url>              base URL para resolver enlaces en el modo source
  --help, -h                mostrar esta ayuda
  --version                 mostrar la version

Ejemplos:
  node src/cli.js tudominio.com
  node src/cli.js tudominio.com --save --deep
  node src/cli.js prompt tudominio.com
  node src/cli.js kit tudominio.com --save
  node src/cli.js source ./dist --base https://tudominio.com`);
  process.exit(exitCode);
}