import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { auditSite, buildGeneratedKit } from './auditor.js';

const rawArgs = process.argv.slice(2);
const known = new Set(['audit', 'kit', 'report']);
const command = known.has(rawArgs[0]) ? rawArgs.shift() : 'audit';
const flags = parseFlags(rawArgs);
const domain = flags._[0];
const name = flags.name || flags.siteName || flags._.slice(1).join(' ');

if (!domain) usage();

try {
  if (command === 'audit') {
    const result = await auditSite({
      url: domain,
      siteName: name,
      crawlLimit: flags.full ? 20 : flags.deep ? 12 : flags.limit,
      linkProbeLimit: flags.full ? 40 : flags.deep ? 24 : flags.linkProbeLimit
    });

    if (flags.save) {
      const dir = await saveFiles(result.kit.files, flags.out || `generated/${safeSlug(result.kit.siteName)}`);
      console.error(`Kit guardado en ${dir}`);
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
      discoveredUrls: flags.urls ? String(flags.urls).split(',').map((item) => item.trim()).filter(Boolean) : [domain]
    });

    if (flags.save) {
      const dir = await saveFiles(kit.files, flags.out || `generated/${safeSlug(kit.siteName)}`);
      console.error(`Kit guardado en ${dir}`);
    }

    console.log(JSON.stringify(kit, null, 2));
  }

  if (command === 'report') {
    const result = await auditSite({ url: domain, siteName: name, crawlLimit: flags.limit });
    console.log(result.reports.markdown);
  }
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}

function parseFlags(values) {
  const out = { _: [] };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
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
    if (!target.startsWith(targetDir)) continue;
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

function usage() {
  console.error('Uso: node src/cli.js dominio.com "Nombre"');
  console.error('Uso: node src/cli.js dominio.com "Nombre" --save');
  console.error('Uso: node src/cli.js dominio.com "Nombre" --deep');
  console.error('Uso: node src/cli.js kit dominio.com "Nombre" --save');
  process.exit(1);
}