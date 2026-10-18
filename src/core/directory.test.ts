import { parseDirectory, resolveTenant } from './directory';
import { directoryInput, tenantA } from '../test/fixtures';
const now = Date.parse('2026-10-18T12:00:00Z');
it('resolves an active compatible tenant and freezes the record', () => {
  const directory = parseDirectory(directoryInput(now), 'staging', now);
  expect(resolveTenant(directory, tenantA, now).name).toBe('Alpha');
  expect(Object.isFrozen(directory.tenants[0])).toBe(true);
});
it.each([
  'http://alpha.example',
  'https://alpha.example/api',
  'https://user:secret@alpha.example',
  'https://alpha.example?origin=evil',
  'https://alpha.example/',
])('rejects noncanonical origin %s', (origin) => {
  const input = directoryInput(now);
  input.tenants[0]!.apiOrigin = origin;
  expect(() => parseDirectory(input, 'staging', now)).toThrow();
});
it('rejects expiry, implausible validity, future publishing and wrong environment', () => {
  const input = directoryInput(now);
  expect(() => parseDirectory(input, 'production', now)).toThrow();
  expect(() => parseDirectory(input, 'staging', now + 60_001)).toThrow();
  expect(() =>
    parseDirectory({ ...input, expiresAt: '2027-01-01T00:00:00Z' }, 'staging', now),
  ).toThrow();
  expect(() =>
    parseDirectory({ ...input, publishedAt: '2027-01-01T00:00:00Z' }, 'staging', now),
  ).toThrow();
});
it('rejects ambiguous identities and absent, disabled or incompatible tenants', () => {
  const input = directoryInput(now);
  input.tenants[1]!.slug = 'alpha';
  expect(() => parseDirectory(input, 'staging', now)).toThrow();
  const valid = directoryInput(now);
  valid.tenants[0]!.status = 'disabled';
  valid.tenants[1]!.contractVersions = [2];
  const directory = parseDirectory(valid, 'staging', now);
  for (const id of [tenantA, valid.tenants[1]!.id, 'missing'])
    expect(() => resolveTenant(directory, id, now)).toThrow();
});
