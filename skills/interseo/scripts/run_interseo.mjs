import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_URL = 'https://github.com/InterLarp/interseo.git';

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
    console.error(`interseo no encontrado. Descargando en ${cache}...`);
    const clone = spawnSync('git', ['clone', '--depth', '1', REPO_URL, cache], {
      stdio: 'inherit',
      shell: false
    });
    if (clone.status !== 0 || !isRepo(cache)) {
      console.error('No se pudo descargar interseo. Instala git o define INTERSEO_HOME apuntando a un checkout del repo.');
      process.exit(1);
    }
  }
  repo = cache;
}

const command = args.length ? args : ['--help'];
const result = spawnSync(process.execPath, [path.join(repo, 'src', 'cli.js'), ...command], {
  cwd: repo,
  stdio: 'inherit',
  shell: false
});

process.exit(result.status ?? 1);

function isRepo(dir) {
  return Boolean(dir) && existsSync(path.join(dir, 'src', 'cli.js'));
}
