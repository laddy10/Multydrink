import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { allowedFile, prepareRelease, verifyRelease, publishRelease } from '../scripts/hostinger-release.mjs';

const sourceSha = 'a'.repeat(40);
const targetSha = 'b'.repeat(40);
async function fixture(t) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'multydrink-release-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const source = path.join(temporary, 'source'); const root = path.join(temporary, 'delivery');
  await mkdir(path.join(source, 'src'), { recursive: true });
  await mkdir(path.join(source, 'scripts'));
  for (const file of ['index.html', 'package.json', 'package-lock.json', 'src/app.js', 'src/config.js']) await writeFile(path.join(source, file), `fixture ${file}`);
  await writeFile(path.join(source, 'scripts/build.mjs'), 'console.log(JSON.stringify([]));');
  await writeFile(path.join(source, '.env'), 'not a credential');
  await mkdir(path.join(source, '.playwright-mcp'));
  await writeFile(path.join(source, '.playwright-mcp/evidence.png'), 'private fixture');
  await prepareRelease(source, root, sourceSha);
  return root;
}
function fakeApi({ changedHead = false, rejectUpdate = false, unmanaged = false, managed = false, identical = false } = {}) {
  const calls = []; let reads = 0;
  return { calls, request: async (method, endpoint, body) => {
    calls.push({ method, endpoint, body });
    if (endpoint === 'ref/heads/main') return { object: { sha: changedHead && ++reads > 1 ? 'c'.repeat(40) : targetSha } };
    if (endpoint.startsWith('ref/heads/backup')) return { object: { sha: unmanaged || managed ? 'e'.repeat(40) : targetSha } };
    if (endpoint.startsWith('commits/')) return { message: managed ? `Sync validated Hostinger sources\n\nSource: https://github.com/laddy10/Multydrink/commit/${sourceSha}` : 'Unmanaged commit', tree: { sha: (identical ? 'd' : 'e').repeat(40) } };
    if (rejectUpdate && method === 'PATCH') throw new Error('HTTP 422; no forced retry');
    return { sha: 'd'.repeat(40) };
  } };
}
const options = (root, request) => ({ root, sourceSha, token: 'test-only', enabled: 'true', deliveryMode: 'hostinger-build-dist', request });

test('Release artifact includes build inputs and excludes private tools, dist and originals', () => {
  for (const file of ['.playwright-mcp/result.png', '.env', '.github/workflows/ci.yml', 'scripts/hostinger-release.mjs', 'scripts/serve.mjs', 'tests/a.js', 'dist/index.html', 'assets/original.png', '../index.html', 'src/../../secret.js', 'src\\app.js']) assert.equal(allowedFile(file), false, file);
  for (const file of ['index.html', 'package.json', 'package-lock.json', 'scripts/build.mjs', 'src/app.js', 'src/product-hero.css', 'assets/favicon.png', 'assets/multydrink/optimized/caja-160.webp']) assert.equal(allowedFile(file), true, file);
});
test('Manifest validates exact file bytes, source identity and additional entries', async t => {
  const root = await fixture(t);
  const files = await verifyRelease(root, sourceSha);
  assert.equal(files.length, 7);
  assert.ok(files.every(file => !file.path.includes('.env') && !file.path.includes('.playwright')));
  await assert.rejects(prepareRelease(path.join(path.dirname(root), 'source'), root, sourceSha), /EEXIST/);
  await assert.rejects(verifyRelease(root, targetSha), /provenance/);
  await writeFile(path.join(root, 'src/app.js'), 'tampered');
  await assert.rejects(verifyRelease(root, sourceSha), /checksum/);
  await writeFile(path.join(root, 'src/app.js'), 'fixture src/app.js');
  await writeFile(path.join(root, '.env'), 'not a credential');
  await assert.rejects(verifyRelease(root, sourceSha), /Unexpected/);
});
test('Unknown hosting, absent enable flag/token and invalid target SHA block before any remote call', async t => {
  const root = await fixture(t); const api = fakeApi();
  for (const change of [{ enabled: '' }, { deliveryMode: '' }, { deliveryMode: 'static-root' }, { token: '' }, { expectedTargetSha: 'main' }]) {
    await assert.rejects(publishRelease({ ...options(root, api.request), ...change }));
  }
  assert.equal(api.calls.length, 0);
});
test('Artifact corruption is rejected before any remote write', async t => {
  const root = await fixture(t); const api = fakeApi();
  await writeFile(path.join(root, 'index.html'), 'changed');
  await assert.rejects(publishRelease(options(root, api.request)), /checksum/);
  assert.equal(api.calls.length, 0);
});
test('Publication sends build sources with auto-selected parent and never rewrites backup or forces main', async t => {
  const root = await fixture(t); const api = fakeApi();
  await publishRelease(options(root, api.request));
  const tree = api.calls.find(call => call.endpoint === 'trees').body;
  assert.equal('base_tree' in tree, false);
  assert.deepEqual(tree.tree.map(file => file.path).sort(), ['index.html', 'package-lock.json', 'package.json', 'release.json', 'scripts/build.mjs', 'src/app.js', 'src/config.js']);
  const commit = api.calls.find(call => call.endpoint === 'commits').body;
  assert.deepEqual(commit.parents, [targetSha]);
  assert.ok(commit.message.includes(sourceSha));
  const updates = api.calls.filter(call => call.method === 'PATCH');
  assert.equal(updates.length, 1);
  assert.equal(updates[0].endpoint, 'refs/heads/main');
  assert.equal(updates[0].body.force, false);
  assert.equal(api.calls.filter(call => call.endpoint.includes('backup') && call.method !== 'GET').length, 0);
  const managed = fakeApi({ managed: true });
  await publishRelease(options(root, managed.request));
  assert.equal(managed.calls.at(-1).method, 'PATCH');
  const identical = fakeApi({ managed: true, identical: true });
  assert.equal(await publishRelease(options(root, identical.request)), targetSha);
  assert.equal(identical.calls.some(call => call.method === 'PATCH' || (call.method === 'POST' && call.endpoint === 'commits')), false);
});
test('Changed target or missing backup aborts without remote writes', async t => {
  const root = await fixture(t);
  for (const missingBackup of [false, true]) {
    const calls = [];
    const request = async (method, endpoint) => {
      calls.push(method);
      return { object: { sha: endpoint.includes('backup') ? undefined : missingBackup ? targetSha : 'e'.repeat(40) } };
    };
    await assert.rejects(publishRelease({ ...options(root, request), expectedTargetSha: targetSha }), /changed|backup/);
    assert.ok(calls.every(method => method === 'GET'));
  }
  const unmanaged = fakeApi({ unmanaged: true });
  await assert.rejects(publishRelease(options(root, unmanaged.request)), /Unmanaged/);
  assert.ok(unmanaged.calls.every(call => call.method === 'GET'));
});
test('Concurrent target updates abort; failed fast-forward never retries with force', async t => {
  const root = await fixture(t);
  const race = fakeApi({ changedHead: true });
  await assert.rejects(publishRelease(options(root, race.request)), /changed during/);
  assert.equal(race.calls.some(call => call.method === 'PATCH'), false);
  const conflict = fakeApi({ rejectUpdate: true });
  await assert.rejects(publishRelease(options(root, conflict.request)), /422/);
  assert.equal(conflict.calls.filter(call => call.method === 'PATCH').length, 1);
  assert.equal(conflict.calls.at(-1).body.force, false);
});
test('Workflow builds the exact package once and gates automatic main sync behind validation', async () => {
  const workflow = await readFile(new URL('../.github/workflows/hostinger-release.yml', import.meta.url), 'utf8');
  const [validation, publication] = workflow.split('\n  publish:\n');
  const ci = await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
  assert.match(validation, /workflow_call:/);
  assert.match(ci, /workflow_dispatch:/);
  assert.match(ci, /default: false/);
  assert.match(ci, /github.event_name == 'push'/);
  assert.match(ci, /github.ref == 'refs\/heads\/main'/);
  assert.doesNotMatch(validation, /HOSTINGER_CONTENTS_TOKEN/);
  assert.match(publication, /needs: validate/);
  assert.match(publication, /environment: hostinger-production/);
  assert.match(publication, /if: inputs.publish/);
  assert.match(workflow, /contents: read/);
  assert.doesNotMatch(workflow, /pull_request_target|force: true/);
  assert.equal((workflow.match(/run: npm run build/g) || []).length, 1);
  assert.match(validation, /npm run build\s+working-directory: release-check/);
  assert.match(validation, /check:build -- release-check\/dist/);
  assert.match(validation, /path: release-source\//);
  assert.doesNotMatch(publication, /run: npm (ci|install|test)|run: npm run build/);
  assert.match(publication, /git ls-remote/);
});
