import { redirectSystemPath } from '../../app/+native-intent';
import { pendingAccountActions } from './pendingAccountAction';
jest.mock('../config', () => ({ runtimeConfig: { linkOrigin: 'https://links.example' } }));
const proof = 'B'.repeat(96);
afterEach(() => pendingAccountActions.clear());
it.each([false, true])(
  'intercepts private account fragments before router state for initial=%s',
  (initial) => {
    const path = `https://links.example/r/alpha/recover#proof=${proof}`;
    expect(redirectSystemPath({ path, initial })).toBe('/account-action');
    expect(pendingAccountActions.snapshot()?.action).toBe('recover');
    expect(JSON.stringify(pendingAccountActions.snapshot())).not.toContain(proof);
  },
);
it.each([
  `https://foreign.example/r/alpha/verify#proof=${proof}`,
  `https://links.example/r/alpha/verify?proof=${proof}`,
  `https://links.example/unknown#proof=${proof}`,
  'https://links.example/r/alpha/verify',
])('strips invalid private input instead of returning it to navigation', (path) => {
  expect(redirectSystemPath({ path, initial: false })).toBe('/account-action');
  expect(pendingAccountActions.snapshot()).toBeUndefined();
});
it('preserves ordinary public/payment links and handles malformed input', () => {
  const path = 'https://links.example/r/alpha/payment-return/public?operation=public';
  expect(redirectSystemPath({ path, initial: false })).toBe(path);
  expect(redirectSystemPath({ path: 'invalid', initial: true })).toBe('/');
});
