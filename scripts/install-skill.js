import { cp, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const source = path.join(root, 'skills', 'interseo');
const codexHome = process.env.CODEX_HOME || path.join(process.env.USERPROFILE || process.env.HOME || '.', '.codex');
const targetRoot = path.join(codexHome, 'skills');
const target = path.join(targetRoot, 'interseo');

if (!existsSync(source)) {
  console.error(`No existe ${source}`);
  process.exit(1);
}

await mkdir(targetRoot, { recursive: true });
await rm(target, { recursive: true, force: true });
await cp(source, target, { recursive: true });
console.log(`Skill instalada en ${target}`);