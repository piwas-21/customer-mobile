import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessAudit } from './audit-report.mjs';
const url = 'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm';
const leaf = {
  name: 'braces',
  dependency: 'braces',
  source: 1,
  severity: 'high',
  range: '<=3.0.3',
  url,
};
const repaired = new Map([[url, { package: 'braces', paths: ['node_modules/braces'] }]]);
function fixture() {
  return {
    auditReportVersion: 2,
    metadata: {
      dependencies: { total: 3 },
      vulnerabilities: { info: 0, low: 0, moderate: 0, high: 3, critical: 0, total: 3 },
    },
    vulnerabilities: {
      braces: { severity: 'high', via: [leaf], nodes: ['node_modules/braces'] },
      metro: { severity: 'high', via: ['braces', 'wrapper'] },
      wrapper: { severity: 'high', via: ['metro'] },
    },
  };
}
test('attested leaf remediation resolves wrapper chains and retains raw finding counts', () => {
  const result = assessAudit(fixture(), 1, repaired);
  assert.deepEqual(result.sourceRemediated, [url]);
  assert.equal(result.registryFindings.high, 3);
});
test('every new advisory and every unverified installed copy blocks', () => {
  const fresh = fixture();
  fresh.vulnerabilities.braces.via.push({ ...leaf, url: 'https://example.test/new-high' });
  assert.throws(() => assessAudit(fresh, 1, repaired), /Unresolved/);
  const copy = fixture();
  copy.vulnerabilities.braces.nodes.push('node_modules/metro/node_modules/braces');
  assert.throws(() => assessAudit(copy, 1, repaired), /coverage mismatch/);
  assert.throws(() => assessAudit(fixture(), 1, new Map()), /Unresolved/);
});
test('malformed/error/empty reports, missing roots, cycle-only ancestry and inconsistent exits fail closed', () => {
  for (const input of [
    null,
    {},
    { error: 'network' },
    { ...fixture(), metadata: { dependencies: { total: 0 } } },
  ]) {
    assert.throws(() => assessAudit(input, 1, repaired));
  }
  const missing = fixture();
  missing.vulnerabilities.metro.via = ['absent'];
  assert.throws(() => assessAudit(missing, 1, repaired), /Missing advisory/);
  const cycle = fixture();
  cycle.vulnerabilities.metro.via = ['wrapper'];
  assert.throws(() => assessAudit(cycle, 1, repaired), /no high advisory root/);
  assert.throws(() => assessAudit(fixture(), 2, repaired));
  assert.throws(() => assessAudit(fixture(), 0, repaired));
});

test('malformed low/unknown leaves cannot hide beside a repaired high leaf', () => {
  for (const change of [
    null,
    {},
    { ...leaf, severity: 'future-critical' },
    { ...leaf, severity: 'moderate', name: '' },
    { ...leaf, source: null },
    { ...leaf, dependency: 'other' },
    { ...leaf, url: 'javascript:invalid' },
  ]) {
    const report = fixture();
    report.vulnerabilities.braces.via.push(change);
    assert.throws(() => assessAudit(report, 1, repaired));
  }
});

test('dependency and total finding counts must be real, consistent integers', () => {
  const total = fixture();
  total.metadata.vulnerabilities.total = 4;
  assert.throws(() => assessAudit(total, 1, repaired), /total count mismatch/);
  for (const count of [Infinity, 0.5, '3']) {
    const report = fixture();
    report.metadata.dependencies.total = count;
    assert.throws(() => assessAudit(report, 1, repaired), /positive control/);
  }
});
