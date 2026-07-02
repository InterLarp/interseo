import { auditSite } from './auditor.js';

const [command, url, ...rest] = process.argv.slice(2);

if (command !== 'audit' || !url) {
  console.error('Uso: node src/cli.js audit https://ejemplo.com [Nombre del sitio]');
  process.exit(1);
}

const siteName = rest.join(' ').trim();

try {
  const result = await auditSite({ url, siteName });
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}
