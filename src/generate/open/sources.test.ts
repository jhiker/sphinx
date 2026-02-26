import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  formatSourceSpec,
  loadSourcesFromFile,
  parseSourceSpec,
} from './sources.js';

void test('parseSourceSpec infers github repo subtype', () => {
  const source = parseSourceSpec('github:owner/repo');
  assert.equal(source.type, 'github');
  assert.equal(source.subtype, 'repo');
  assert.equal(source.target, 'owner/repo');
});

void test('parseSourceSpec infers github PR subtype from URL', () => {
  const source = parseSourceSpec('github:https://github.com/acme/project/pull/123');
  assert.equal(source.type, 'github');
  assert.equal(source.subtype, 'pr');
});

void test('formatSourceSpec includes subtype when present', () => {
  const label = formatSourceSpec({
    type: 'github',
    subtype: 'repo',
    target: 'owner/repo',
  });
  assert.equal(label, 'github (repo) owner/repo');
});

void test('loadSourcesFromFile supports object with sources array', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'sphinx-sources-test-'));
  const filePath = join(dir, 'sources.json');

  try {
    await writeFile(
      filePath,
      JSON.stringify({
        sources: [
          'github:owner/repo',
          { type: 'file', target: './README.md' },
        ],
      }),
      'utf-8'
    );

    const sources = await loadSourcesFromFile(filePath);
    assert.equal(sources.length, 2);
    assert.deepEqual(sources[0], {
      type: 'github',
      target: 'owner/repo',
      subtype: 'repo',
    });
    assert.deepEqual(sources[1], {
      type: 'file',
      target: './README.md',
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
