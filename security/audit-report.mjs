import assert from 'node:assert/strict';
const severities = new Set(['info', 'low', 'moderate', 'high', 'critical']);
const blocking = new Set(['high', 'critical']);
function validateLeaf(leaf) {
  assert(leaf && typeof leaf === 'object', 'Malformed advisory leaf');
  assert(severities.has(leaf.severity), 'Unknown advisory leaf severity');
  for (const key of ['name', 'dependency', 'url', 'range'])
    assert(typeof leaf[key] === 'string' && leaf[key].length > 0, 'Malformed advisory identity');
  assert(Number.isSafeInteger(leaf.source) && leaf.source > 0, 'Malformed advisory source');
  assert(leaf.dependency === leaf.name, 'Unexpected advisory dependency identity');
  assert(URL.canParse(leaf.url) && new URL(leaf.url).protocol === 'https:', 'Invalid advisory URL');
}
function validateAdvisories(report) {
  for (const value of Object.values(report.vulnerabilities)) {
    assert(severities.has(value.severity), 'Unknown advisory severity');
    assert(Array.isArray(value.via) && value.via.length > 0, 'Missing advisory ancestry');
    for (const leaf of value.via) {
      if (typeof leaf === 'string')
        assert(leaf.length > 0 && report.vulnerabilities[leaf], 'Missing advisory ancestry');
      else validateLeaf(leaf);
    }
  }
}
function validateReport(report, exitCode) {
  assert(
    report && typeof report === 'object' && !report.error,
    'npm audit did not produce a usable report',
  );
  assert.equal(report.auditReportVersion, 2);
  const dependencyCount = report.metadata?.dependencies?.total;
  assert(
    Number.isSafeInteger(dependencyCount) && dependencyCount > 0,
    'No audited dependency positive control',
  );
  assert(report.vulnerabilities && typeof report.vulnerabilities === 'object');
  assert(exitCode === 0 || exitCode === 1, 'npm audit process failed');
  validateAdvisories(report);
  for (const severity of severities) {
    assert.equal(
      report.metadata.vulnerabilities?.[severity],
      Object.values(report.vulnerabilities).filter((value) => value.severity === severity).length,
      'Audit metadata/findings count mismatch',
    );
  }
  assert.equal(
    report.metadata.vulnerabilities.total,
    Object.keys(report.vulnerabilities).length,
    'Audit total count mismatch',
  );
  const highCount = report.metadata.vulnerabilities.high + report.metadata.vulnerabilities.critical;
  assert.equal(exitCode, highCount > 0 ? 1 : 0, 'Audit exit status contradicts finding counts');
}
function advisoryRoots(name, report, visiting = new Set()) {
  if (visiting.has(name)) return [];
  const value = report.vulnerabilities[name];
  assert(
    value && Array.isArray(value.via) && value.via.length > 0,
    `Missing advisory ancestry: ${name}`,
  );
  const next = new Set(visiting);
  next.add(name);
  return value.via.flatMap((via) =>
    typeof via === 'string' ? advisoryRoots(via, report, next) : [via],
  );
}
function verifyLeafCoverage(leaf, report, verified) {
  const repair = verified.get(leaf.url);
  assert(repair && repair.package === leaf.name, `Unresolved security advisory: ${leaf.url}`);
  const root = report.vulnerabilities[leaf.name];
  assert(root && Array.isArray(root.nodes) && root.nodes.length > 0);
  assert.deepEqual(
    [...root.nodes].sort((a, b) => a.localeCompare(b, 'en')),
    repair.paths,
    `Installed-copy coverage mismatch: ${leaf.name}`,
  );
}
export function assessAudit(report, exitCode, verified) {
  validateReport(report, exitCode);
  const remediated = new Set();
  for (const [name, value] of Object.entries(report.vulnerabilities)) {
    if (!blocking.has(value.severity)) continue;
    const leaves = advisoryRoots(name, report).filter((leaf) => blocking.has(leaf.severity));
    assert(leaves.length > 0, `High finding has no high advisory root: ${name}`);
    for (const leaf of leaves) {
      verifyLeafCoverage(leaf, report, verified);
      remediated.add(leaf.url);
    }
  }
  return { registryFindings: report.metadata.vulnerabilities, sourceRemediated: [...remediated] };
}
