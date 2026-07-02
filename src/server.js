import { createServer } from 'node:http';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditSite } from './auditor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const GENERATED_DIR = path.join(ROOT_DIR, 'generated');
const PORT = Number(process.env.PORT || 4173);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    if (req.method === 'GET' && url.pathname === '/api/health') {
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === 'POST' && url.pathname === '/api/audit') {
      const body = await readJson(req);
      const result = await auditSite(body);
      return sendJson(res, 200, result);
    }

    if (req.method === 'POST' && url.pathname === '/api/save-kit') {
      const body = await readJson(req);
      const saved = await saveKit(body);
      return sendJson(res, 200, saved);
    }

    if (req.method !== 'GET') {
      return sendJson(res, 405, { error: 'Metodo no permitido.' });
    }

    return serveStatic(url.pathname, res);
  } catch (error) {
    return sendJson(res, 500, { error: error.message || 'Error interno.' });
  }
});

server.listen(PORT, () => {
  console.log(`interseo listo en http://localhost:${PORT}`);
});

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1_000_000) {
      throw new Error('La peticion es demasiado grande.');
    }
  }

  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('JSON invalido.');
  }
}

async function serveStatic(pathname, res) {
  const decoded = decodeURIComponent(pathname);
  const requestedPath = decoded === '/' ? '/index.html' : decoded;
  const resolved = path.resolve(PUBLIC_DIR, `.${requestedPath}`);

  if (!resolved.startsWith(PUBLIC_DIR)) {
    return sendText(res, 403, 'Prohibido', 'text/plain; charset=utf-8');
  }

  let filePath = resolved;
  const info = await stat(filePath).catch(() => null);
  if (info?.isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  const file = await readFile(filePath).catch(() => null);
  if (!file) {
    return sendText(res, 404, 'No encontrado', 'text/plain; charset=utf-8');
  }

  const type = MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, {
    'content-type': type,
    'cache-control': 'no-store'
  });
  res.end(file);
}

async function saveKit(body) {
  const files = Array.isArray(body.files) ? body.files : [];
  if (!files.length) {
    throw new Error('No hay archivos para guardar.');
  }

  const slug = safeSlug(body.siteName || body.origin || 'interseo-kit');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const targetDir = path.join(GENERATED_DIR, `${slug}-${stamp}`);
  await mkdir(targetDir, { recursive: true });

  const savedFiles = [];
  for (const file of files) {
    const relativePath = safeRelativePath(file.path || '');
    if (!relativePath) continue;

    const outputPath = path.resolve(targetDir, relativePath);
    if (!outputPath.startsWith(targetDir)) continue;

    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, String(file.content || ''), 'utf8');
    savedFiles.push(path.relative(targetDir, outputPath));
  }

  return {
    directory: targetDir,
    files: savedFiles
  };
}

function safeRelativePath(value) {
  return String(value || '')
    .replace(/\\/g, '/')
    .split('/')
    .filter((part) => part && part !== '.' && part !== '..')
    .join('/');
}

function safeSlug(value) {
  return String(value || 'interseo-kit')
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'interseo-kit';
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
  res.end(JSON.stringify(data, null, 2));
}

function sendText(res, status, text, contentType) {
  res.writeHead(status, {
    'content-type': contentType,
    'cache-control': 'no-store'
  });
  res.end(text);
}
