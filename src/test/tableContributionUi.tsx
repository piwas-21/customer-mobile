import type { PropsWithChildren } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { openBrowserAsync, type WebBrowserResult } from 'expo-web-browser';
import { setReservationUiRepository } from './reservationUiSetup';
import { tableContributionControllerFixture } from './tableContributionController';
import { mockWorkspaceOwner } from './workspaceOwner';
import { privateTableUi } from './privateTableUi';
import ContributionProvider from '../features/tables/ContributionProvider';
import { readTablePaymentAccount } from '../api/tablePaymentAccount';
import { tableAccount } from './tableAccount';
import { paymentReadSession } from './tablePaymentAccount';
import { roundGuard } from './tableRoundRepository';
export async function tableContributionUiFixture(
  customer = false,
  custom = false,
  pending = false,
) {
  const f = await tableContributionControllerFixture(customer, custom);
  setReservationUiRepository(f.repository);
  const owner = mockWorkspaceOwner(f);
  jest.mocked(randomUUID).mockImplementation(f.createId);
  jest.mocked(openBrowserAsync).mockImplementation(async (url) => {
    await f.openBrowser(url);
    return { type: 'cancel' } as WebBrowserResult;
  });
  const { bootstrapQuery, cache } = privateTableUi(f.bootstrap);
  if (pending) await f.install();
  const bill = tableAccount();
  bill.items[0]!.item.itemId = paymentReadSession;
  const scope = {
    read: (guard: () => void) =>
      readTablePaymentAccount(
        f.client,
        f.context,
        f.bootstrap,
        {
          visit: f.preparation.visit,
          sessionId: f.preparation.sessionId,
          currency: 'CHF',
        },
        guard,
        'en',
      ),
    visit: bill.serviceSessionId,
    revision: bill.accountRevision,
    currency: 'CHF',
  };
  function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={cache}>
        <ContributionProvider>{children}</ContributionProvider>
      </QueryClientProvider>
    );
  }
  return { ...f, owner, bootstrapQuery, cache, bill, scope, Wrapper, guard: roundGuard };
}
