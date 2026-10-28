import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile, mkdir, lstat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repository = 'santgodev/Multydrink';
const sourceRepository = 'laddy10/Multydrink';
const manifestName = 'release.json';
const shaPattern = /^[a-f0-9]{40}$/;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const execute = promisify(execFile);
const commitPrefix = `Sync validated Hostinger sources\n\nSource: https://github.com/${sourceRepository}/commit/`;
function requireSha(value) {
  if (!shaPattern.test(value || '')) throw new Error('A full lowercase 40-character commit SHA is required');
}
// Build inputs only: no server entry, QA evidence, workflows or development tools.
export function allowedFile(file) {
  return /^(?:index\.html|package(?:-lock)?\.json|scripts\/build\.mjs|src\/[\w-]+\.(?:js|css)|assets\/(?:multydrink\/optimized\/)?[\w-]+\.webp|assets\/[\w-]+\.(?:ttf|svg)|assets\/favicon\.png|assets\/[\w-]+-LICENSE\.txt)$/.test(file);
}
async function listFiles(root, prefix = '') {
  const result = [];
  for (const entry of await readdir(path.join(root, prefix), { withFileTypes: true })) {
    const file = prefix + entry.name;
    if (entry.isSymbolicLink()) throw new Error('Symlinks are not publishable');
    if (entry.isDirectory()) {
      if (!['scripts', 'src', 'assets', 'assets/multydrink', 'assets/multydrink/optimized'].includes(file)) throw new Error(`Unexpected directory: ${file}`);
      result.push(...await listFiles(root, file + '/'));
    } else if (entry.isFile() && (file === manifestName || allowedFile(file))) result.push(file);
    else throw new Error(`Unexpected build entry: ${file}`);
  }
  return result.sort();
}
async function contents(root) {
  const files = await listFiles(root);
  for (const required of ['index.html', 'package.json', 'package-lock.json', 'scripts/build.mjs', 'src/app.js', 'src/config.js']) {
    if (!files.includes(required)) throw new Error(`Missing build file: ${required}`);
  }
  return Promise.all(files.filter(file => file !== manifestName).map(async file => {
    const bytes = await readFile(path.join(root, file));
    return { path: file, bytes, sha256: hash(bytes) };
  }));
}
export async function prepareRelease(source, root, sourceSha) {
  requireSha(sourceSha);
  source = path.resolve(source); root = path.resolve(root);
  if (root === source || source.startsWith(root + path.sep)) throw new Error('Output must be a new staging directory, not the source or its parent');
  // Refuse symlinks in every selected path, including ancestor directories.
  async function checkedPath(file) {
    let current = source;
    for (const part of file.split('/')) {
      current = path.join(current, part);
      if ((await lstat(current)).isSymbolicLink()) throw new Error('Symlinks are not publishable');
    }
    if (!(await lstat(current)).isFile()) throw new Error(`Not a source file: ${file}`);
    return current;
  }
  await checkedPath('scripts/build.mjs');
  const { stdout } = await execute(process.execPath, ['scripts/build.mjs', '--list-inputs'], { cwd: source, windowsHide: true, timeout: 30000 });
  const assets = JSON.parse(stdout);
  if (!Array.isArray(assets) || assets.some(file => typeof file !== 'string' || !file.startsWith('assets/') || !allowedFile(file))) throw new Error('Build returned unsupported input paths');
  const modules = (await readdir(path.join(source, 'src'))).map(name => 'src/' + name);
  const selected = [...new Set(['index.html', 'package.json', 'package-lock.json', 'scripts/build.mjs', ...modules, ...assets])].sort();
  const inputs = [];
  for (const file of selected) {
    if (!allowedFile(file)) throw new Error(`Unexpected source entry: ${file}`);
    inputs.push({ file, bytes: await readFile(await checkedPath(file)) });
  }
  // Never clear or overwrite a prior staging directory or the user's checkout.
  await mkdir(root);
  for (const { file, bytes } of inputs) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), bytes);
  }
  const files = await contents(root);
  const manifest = { format: 2, deliveryMode: 'hostinger-build-dist', sourceRepository, sourceSha, files: files.map(({ path, sha256 }) => ({ path, sha256 })) };
  await writeFile(path.join(root, manifestName), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}
export async function verifyRelease(root, sourceSha) {
  requireSha(sourceSha);
  const manifestBytes = await readFile(path.join(root, manifestName));
  const manifest = JSON.parse(manifestBytes);
  if (manifest.format !== 2 || manifest.deliveryMode !== 'hostinger-build-dist' || manifest.sourceRepository !== sourceRepository || manifest.sourceSha !== sourceSha) throw new Error('Release provenance mismatch');
  const files = await contents(root);
  if (JSON.stringify(manifest.files) !== JSON.stringify(files.map(({ path, sha256 }) => ({ path, sha256 })))) throw new Error('Release file list or checksum mismatch');
  return [...files, { path: manifestName, bytes: manifestBytes }];
}
export async function publishRelease({ root, sourceSha, expectedTargetSha, enabled, deliveryMode, token, request }) {
  // Every check precedes the first remote write. No deployment by default.
  if (enabled !== 'true' || deliveryMode !== 'hostinger-build-dist') throw new Error('Publication blocked: Hostinger output dist and no server entry must be verified and explicitly enabled');
  if (expectedTargetSha !== undefined) requireSha(expectedTargetSha);
  if (!token) throw new Error('Missing environment-scoped target token');
  const files = await verifyRelease(root, sourceSha);
  const api = request || (async (method, endpoint, body) => {
    // Git Data writes count toward GitHub's secondary content-creation limits.
    // Serialize and pace them; a rejected request fails closed, never forces main.
    if (method !== 'GET') await new Promise(resolve => setTimeout(resolve, 1000));
    const response = await fetch(`https://api.github.com/repos/${repository}/git/${endpoint}`, {
      method, redirect: 'error', signal: AbortSignal.timeout(30000),
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    // Do not echo credentials or server response bodies in CI logs.
    if (!response.ok) throw new Error(`GitHub ${method} ${endpoint}: HTTP ${response.status}; no forced retry`);
    return response.json();
  });
  const head = await api('GET', 'ref/heads/main');
  requireSha(head.object?.sha);
  if (expectedTargetSha && head.object.sha !== expectedTargetSha) throw new Error('Target main changed; review the new head before publishing');
  expectedTargetSha = head.object.sha;
  const backup = await api('GET', 'ref/heads/backup-inicial-hostinger');
  if (!shaPattern.test(backup.object?.sha || '')) throw new Error('Required backup branch missing');
  const parent = await api('GET', `commits/${expectedTargetSha}`);
  // First publication must start at the backup; later heads must be managed releases.
  // An unexpected human commit stops automation instead of silently overwriting it.
  if (expectedTargetSha !== backup.object.sha && !(parent.message?.startsWith(commitPrefix) && shaPattern.test(parent.message.slice(commitPrefix.length).trimEnd()))) throw new Error('Unmanaged target main; review its changes before syncing');
  const tree = [];
  for (const file of files) {
    const blob = await api('POST', 'blobs', { content: file.bytes.toString('base64'), encoding: 'base64' });
    tree.push({ path: file.path, mode: '100644', type: 'blob', sha: blob.sha });
  }
  // A fresh tree contains exactly the verified build inputs, never a copied dist.
  // Its commit remains a child of the existing target history; backup is untouched.
  const builtTree = await api('POST', 'trees', { tree });
  if (builtTree.sha === parent.tree?.sha) return expectedTargetSha; // Identical rerun does not trigger Hostinger again.
  const commit = await api('POST', 'commits', {
    message: commitPrefix + sourceSha,
    tree: builtTree.sha, parents: [expectedTargetSha]
  });
  const latest = await api('GET', 'ref/heads/main');
  if (latest.object?.sha !== expectedTargetSha) throw new Error('Target changed during preparation; main was not updated');
  // GitHub rejects a non-fast-forward update even if a writer races this last check.
  await api('PATCH', 'refs/heads/main', { sha: commit.sha, force: false });
  return commit.sha;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [command, root, sourceSha, output] = process.argv.slice(2);
  try {
    if (command === 'prepare') {
      const manifest = await prepareRelease(root, output, sourceSha);
      console.log(`Prepared ${manifest.files.length} build inputs for ${sourceSha}; no remote writes`);
    } else if (command === 'verify') {
      console.log(`Verified ${(await verifyRelease(root, sourceSha)).length} files; no remote writes`);
    } else if (command === 'publish') {
      const sha = await publishRelease({ root, sourceSha, expectedTargetSha: process.env.EXPECTED_TARGET_SHA,
        enabled: process.env.HOSTINGER_PUBLISH_ENABLED, deliveryMode: process.env.HOSTINGER_DELIVERY_MODE, token: process.env.HOSTINGER_CONTENTS_TOKEN });
      console.log(`Target release: ${sha}; verify Hostinger builds and serves dist separately`);
    } else throw new Error('Usage: prepare <source-directory> <source-sha> <new-output-directory>, or verify|publish <artifact-directory> <source-sha>');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
