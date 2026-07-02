import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeHtml, normalizeUrl } from '../src/analyzer.js';

test('normalizeUrl reports URL errors in English', () => {
  assert.throws(() => normalizeUrl(''), /Enter a URL/);
  assert.throws(() => normalizeUrl('http://%zz'), /Invalid URL/);
});

test('analyzeHtml labels invalid JSON-LD in English', () => {
  const result = analyzeHtml('<script type="application/ld+json">{bad json</script>', 'https://example.com/');
  assert.deepEqual(result.jsonLdTypes, ['Invalid JSON-LD']);
});