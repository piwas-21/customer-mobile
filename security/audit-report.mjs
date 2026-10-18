import assert from 'node:assert/strict';

export function assessAudit(report, exitCode, verified) {
  assert(
    report && typeof report === 'object' && !report.error,
    'npm audit did not produce a usable report',
  );
  assert.equal(report.auditReportVersion, 2);
  assert(report.metadata?.dependencies?.total > 0, 'No audited dependency positive control');
  assert(report.vulnerabilities && typeof report.vulnerabilities === 'object');
  assert(exitCode === 0 || exitCode === 1, 'npm audit process failed');
  const severities = ['info', 'low', 'moderate', 'high', 'critical'];
  for (const value of Object.values(report.vulnerabilities)) {
    assert(severities.includes(value.severity), 'Unknown advisory severity');
    assert(Array.isArray(value.via) && value.via.length > 0, 'Missing advisory ancestry');
    for (const leaf of value.via) {
      if (typeof leaf === 'string') {
        assert(leaf.length > 0 && report.vulnerabilities[leaf], 'Missing advisory ancestry');
        continue;
      }
      assert(leaf && typeof leaf === 'object', 'Malformed advisory leaf');
      assert(severities.includes(leaf.severity), 'Unknown advisory leaf severity');
      for (const key of ['name', 'dependency', 'url', 'range'])
        assert(
          typeof leaf[key] === 'string' && leaf[key].length > 0,
          'Malformed advisory identity',
        );
      assert(Number.isSafeInteger(leaf.source) && leaf.source > 0, 'Malformed advisory source');
      assert(leaf.dependency === leaf.name, 'Unexpected advisory dependency identity');
      assert(
        URL.canParse(leaf.url) && new URL(leaf.url).protocol === 'https:',
        'Invalid advisory URL',
      );
    }
  }
  for (const severity of severities) {
    assert.equal(
      report.metadata.vulnerabilities?.[severity],
      Object.values(report.vulnerabilities).filter((value) => value.severity === severity).length,
      'Audit metadata/findings count mismatch',
    );
  }
  const highCount = report.metadata.vulnerabilities.high + report.metadata.vulnerabilities.critical;
  assert.equal(exitCode, highCount > 0 ? 1 : 0, 'Audit exit status contradicts finding counts');
  const roots = (name, visiting = new Set()) => {
    if (visiting.has(name)) return [];
    const value = report.vulnerabilities[name];
    assert(
      value && Array.isArray(value.via) && value.via.length > 0,
      `Missing advisory ancestry: ${name}`,
    );
    const next = new Set(visiting);
    next.add(name);
    return value.via.flatMap((via) => (typeof via === 'string' ? roots(via, next) : [via]));
  };
  const remediated = new Set();
  for (const [name, value] of Object.entries(report.vulnerabilities)) {
    if (!['high', 'critical'].includes(value.severity)) continue;
    const leaves = roots(name).filter((leaf) => ['high', 'critical'].includes(leaf.severity));
    assert(leaves.length > 0, `High finding has no high advisory root: ${name}`);
    for (const leaf of leaves) {
      const repair = verified.get(leaf.url);
      assert(repair && repair.package === leaf.name, `Unresolved security advisory: ${leaf.url}`);
      const root = report.vulnerabilities[leaf.name];
      assert(root && Array.isArray(root.nodes) && root.nodes.length > 0);
      assert.deepEqual(
        [...root.nodes].sort(),
        repair.paths,
        `Installed-copy coverage mismatch: ${leaf.name}`,
      );
      remediated.add(leaf.url);
    }
  }
  return { registryFindings: report.metadata.vulnerabilities, sourceRemediated: [...remediated] };
}
