import { fireEvent } from '@testing-library/react-native';
import useBootstrap from '../features/restaurant/useBootstrap';
import type { Bootstrap } from '../core/capabilities';
import { accountBootstrap } from './accounts';
import { privateModuleSetup } from './privateModules';
import { loyaltyBalance, loyaltyPage } from './loyalty';
import { response } from './transport';
import LoyaltyControl from '../features/loyalty/LoyaltyControl';

const loyaltyBootstrapData: Bootstrap = {
  ...accountBootstrap.data,
  timezone: 'America/Los_Angeles',
  capabilities: { accounts: 'enabled', loyalty: 'enabled' },
};
export const loyaltyEnabled = { ...accountBootstrap, data: loyaltyBootstrapData } as ReturnType<
  typeof useBootstrap
>;
export const loyaltyDisabled = {
  ...loyaltyEnabled,
  data: { ...loyaltyEnabled.data!, capabilities: { loyalty: 'disabled' } },
} as ReturnType<typeof useBootstrap>;
export async function loyaltyHistorySetup(customer = true) {
  const f = await privateModuleSetup(LoyaltyControl, loyaltyEnabled, customer);
  f.fetcher.mockImplementation(async (url) =>
    response({ success: true, data: url.includes('/balance?') ? loyaltyBalance : loyaltyPage() }),
  );
  return {
    ...f,
    open: () => fireEvent.press(f.screen.getByRole('button', { name: 'Your points' })),
  };
}
