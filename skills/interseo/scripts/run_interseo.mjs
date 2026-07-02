import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const explicitHome = process.env.INTERSEO_HOME || process.argv[2];
const repo = explicitHome ? path.resolve(explicitHome) : path.resolve(__dirname, '..', '..', '..');
const args = explicitHome ? process.argv.slice(3) : process.argv.slice(2);
const command = args.length ? args : ['audit'];
const result = spawnSync(process.execPath, [path.join(repo, 'src', 'cli.js'), ...command], {
  cwd: repo,
  stdio: 'inherit',
  shell: false
});

process.exit(result.status ?? 1);