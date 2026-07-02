import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const textFiles = [
  'README.md',
  'docs/mcp.md',
  'skills/interseo/SKILL.md',
  'skills/interseo/references/skill-runner-and-mcp.md',
  'skills/interseo/scripts/run_interseo.mjs'
];

test('project exposes only MCP and the skill runner', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

  assert.equal(existsSync('src/cli.js'), false);
  assert.equal(existsSync('docs/cli.md'), false);
  assert.equal(existsSync('skills/interseo/references/cli-and-mcp.md'), false);
  assert.deepEqual(Object.keys(pkg.scripts).sort(), ['mcp', 'skill:install', 'test']);
});

test('docs and runner do not reference the removed CLI entrypoint', () => {
  for (const file of textFiles) {
    const content = readFileSync(file, 'utf8');
    assert.equal(content.includes('src/cli.js'), false, `${file} references src/cli.js`);
    assert.equal(content.includes('docs/cli.md'), false, `${file} references docs/cli.md`);
    assert.equal(content.includes('cli-and-mcp'), false, `${file} references cli-and-mcp`);
  }
});
test('skill runner documents human aliases', () => {
  const runner = readFileSync('skills/interseo/scripts/run_interseo.mjs', 'utf8');
  const reference = readFileSync('skills/interseo/references/skill-runner-and-mcp.md', 'utf8');

  for (const alias of ["'audit', 'source'", "'check', 'source'", "'generate', 'kit'"]) {
    assert.equal(runner.includes(alias), true, `runner missing alias ${alias}`);
  }
  for (const action of ['`audit`', '`check`', '`generate`']) {
    assert.equal(reference.includes(action), true, `reference missing action ${action}`);
  }
});
