import { resolveScanEntry } from './scanEntry';
import { directoryInput, fixtureDirectory, tenantA } from '../test/fixtures';
import { parseDirectory } from './directory';
const origin = 'https://links.example';
it('preserves the exact existing printed table payload at the registered restaurant web origin', () => {
  expect(
    resolveScanEntry(
      'https://alpha.example/scan?qr=table_original%2Bpayload',
      origin,
      fixtureDirectory(),
    ),
  ).toEqual({ tenantId: tenantA, destination: 'table', reference: 'table_original+payload' });
});
it('retains the central menu and table contracts', () => {
  expect(resolveScanEntry(`${origin}/r/alpha/menu`, origin, fixtureDirectory())).toEqual({
    tenantId: tenantA,
    destination: 'menu',
  });
  expect(resolveScanEntry(`${origin}/r/alpha/table/qr`, origin, fixtureDirectory())).toEqual({
    tenantId: tenantA,
    destination: 'table',
    reference: 'qr',
  });
});
it.each([
  'https://hostile.example/scan?qr=secret',
  'https://alpha.example.hostile.example/scan?qr=secret',
  'http://alpha.example/scan?qr=secret',
  'https://alpha.example:444/scan?qr=secret',
  'https://user@alpha.example/scan?qr=secret',
  'https://alpha.example/scan?qr=secret#fragment',
  'https://alpha.example/scan?qr=secret&qr=other',
  'https://alpha.example/scan?qr=secret&redirect=https://hostile.example',
  'https://alpha.example/scan',
  'https://alpha.example/scan?qr=',
  'https://alpha.example/scan?qr=%20',
  'https://alpha.example/scan/extra?qr=secret',
])('refuses an untrusted or ambiguous printed table entry %s', (value) => {
  expect(() => resolveScanEntry(value, origin, fixtureDirectory())).toThrow();
});
it.each(['expired', 'disabled', 'incompatible', 'ambiguous'])(
  'refuses a printed table entry after directory authority is %s',
  (mode) => {
    const now = Date.now();
    const input = directoryInput(now);
    if (mode === 'disabled') input.tenants[0]!.status = 'disabled';
    if (mode === 'incompatible') input.tenants[0]!.contractVersions = [2];
    if (mode === 'ambiguous') input.tenants[1]!.webOrigin = input.tenants[0]!.webOrigin;
    const directory = parseDirectory(input, 'staging', now);
    if (mode === 'expired') jest.spyOn(Date, 'now').mockReturnValue(now + 60_000);
    try {
      expect(() =>
        resolveScanEntry('https://alpha.example/scan?qr=secret', origin, directory),
      ).toThrow();
    } finally {
      jest.restoreAllMocks();
    }
  },
);
