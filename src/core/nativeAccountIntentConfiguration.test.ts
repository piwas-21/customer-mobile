import { redirectSystemPath } from '../../app/+native-intent';
import { pendingAccountActions } from './pendingAccountAction';
jest.mock('../config', () => ({ runtimeConfig: undefined }));
it('strips a private fragment without capturing a proof when trusted configuration is missing', () => {
  expect(
    redirectSystemPath({
      path: 'https://links.example/r/alpha/verify#proof=' + 'A'.repeat(96),
      initial: true,
    }),
  ).toBe('/account-action');
  expect(pendingAccountActions.snapshot()).toBeUndefined();
});
