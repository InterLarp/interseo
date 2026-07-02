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
      console.error(`Kit guardado en ${dir}`);
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
  print(`interseo ${pkg.version} - auditor SEO de codigo fuente

Uso: node src/cli.js [comando] <carpeta|url> [flags]

Comandos:
  source   auditar el codigo fuente de un sitio, carpeta con HTML (por defecto)
  kit      generar robots.txt, sitemap.xml, JSON-LD, legales y mas para una URL

Flags de source:
  --base <url>              base URL para resolver enlaces internos absolutos
  --limit <n>               maximo de archivos HTML a analizar (200 por defecto)
  --prompt                  imprimir un prompt de arreglo con rutas de archivo
  --json                    imprimir el resultado completo como JSON

Flags de kit:
  --save                    guardar los archivos generados en disco
  --out <dir>               carpeta de salida (por defecto generated/<sitio>)
  --name <nombre>           nombre del sitio
  --description <texto>     descripcion corta
  --businessName <nombre>   nombre legal para las plantillas
  --lang <codigo>           idioma para los datos estructurados
  --urls <lista>            URLs para el sitemap (separadas por comas)

Generales:
  --help, -h                mostrar esta ayuda
  --version                 mostrar la version

Ejemplos:
  node src/cli.js source ./dist --base https://tudominio.com
  node src/cli.js source ./public --prompt
  node src/cli.js kit tudominio.com --save`);
  process.exit(exitCode);
}
