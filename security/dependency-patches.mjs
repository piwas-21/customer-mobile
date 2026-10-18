import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, lstatSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';

export const sha256 = (value) => createHash('sha256').update(value).digest('hex');
function within(root, path) {
  const target = resolve(root, path);
  const part = relative(resolve(root), target);
  assert(part && !part.startsWith(`..${sep}`) && part !== '..', 'Invalid patch path');
  return target;
}
export function loadRemediations(root = process.cwd()) {
  const manifest = JSON.parse(readFileSync(resolve(root, 'security/remediations.json'), 'utf8'));
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.remediations.length, 2, 'Review changes to the remediation set explicitly');
  return manifest.remediations;
}
export function installedCopies(root, spec) {
  const lock = JSON.parse(readFileSync(resolve(root, 'package-lock.json'), 'utf8'));
  assert.equal(lock.lockfileVersion, 3);
  const suffix = `node_modules/${spec.package}`;
  const paths = Object.keys(lock.packages).filter(
    (path) => path === suffix || path.endsWith(`/${suffix}`),
  );
  assert(paths.length > 0, `No lockfile positive control for ${spec.package}`);
  return paths.map((path) => {
    const entry = lock.packages[path];
    assert.equal(entry.version, spec.version, `Unreviewed ${spec.package} version`);
    assert.match(entry.integrity, /^sha512-/, 'Registry artifact integrity is required');
    const folder = within(root, path);
    const pkg = JSON.parse(readFileSync(resolve(folder, 'package.json'), 'utf8'));
    assert.equal(pkg.name, spec.package);
    assert.equal(pkg.version, spec.version);
    return { path, folder };
  });
}
function readRegular(path) {
  assert(lstatSync(path).isFile(), `Expected regular dependency source: ${path}`);
  return readFileSync(path, 'utf8');
}
export function verifyRemediations(root = process.cwd()) {
  const verified = new Map();
  for (const spec of loadRemediations(root)) {
    const copies = installedCopies(root, spec);
    for (const { folder } of copies) {
      for (const file of spec.files) {
        assert.equal(
          sha256(readRegular(within(folder, file.path))),
          file.patchedSha256,
          `Unrepaired/modified ${spec.package}/${file.path}; run npm run dependencies:prepare`,
        );
      }
      for (const file of spec.addedFiles) {
        assert.equal(sha256(readRegular(within(root, file.source))), file.sha256);
        assert.equal(sha256(readRegular(within(folder, file.path))), file.sha256);
      }
    }
    verified.set(spec.advisory, {
      package: spec.package,
      paths: copies.map((copy) => copy.path).sort((a, b) => a.localeCompare(b, 'en')),
    });
  }
  return verified;
}
function repairedSource(folder, spec, writes) {
  for (const file of spec.files) {
    const path = within(folder, file.path);
    let source = readRegular(path);
    if (sha256(source) === file.patchedSha256) continue;
    assert.equal(
      sha256(source),
      file.originalSha256,
      `Unexpected ${spec.package} source; refusing patch`,
    );
    for (const change of file.replacements) {
      assert(change.before && change.before !== change.after);
      assert.equal(source.split(change.before).length - 1, change.count);
      source = source.split(change.before).join(change.after);
    }
    assert.equal(sha256(source), file.patchedSha256);
    writes.push({ path, source });
  }
}
function addedSource(root, folder, spec, writes) {
  for (const file of spec.addedFiles) {
    const source = readRegular(within(root, file.source));
    assert.equal(sha256(source), file.sha256);
    const path = within(folder, file.path);
    if (existsSync(path)) assert.equal(sha256(readRegular(path)), file.sha256);
    else writes.push({ path, source });
  }
}
export function applyRemediations(root = process.cwd()) {
  const writes = [];
  for (const spec of loadRemediations(root)) {
    for (const { folder } of installedCopies(root, spec)) {
      repairedSource(folder, spec, writes);
      addedSource(root, folder, spec, writes);
    }
  }
  for (const { path, source } of writes) writeFileSync(path, source);
  return verifyRemediations(root);
}
