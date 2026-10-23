import type { PropsWithChildren } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { setReservationUiRepository } from './reservationUiSetup';
import { tablePlanControllerFixture } from './tablePlanController';
import { mockWorkspaceOwner } from './workspaceOwner';
import { tenantB } from './fixtures';
import { tableAccount } from './tableAccount';
import { readTablePaymentAccount } from '../api/tablePaymentAccount';
import { privateTableUi } from './privateTableUi';
import PlanProvider from '../features/tables/PlanProvider';
export async function tablePlanUiFixture(customer = false, pending = false) {
  const f = await tablePlanControllerFixture(customer);
  setReservationUiRepository(f.repository);
  const owner = mockWorkspaceOwner(f);
  jest.mocked(randomUUID).mockReturnValue(tenantB);
  const { bootstrapQuery, cache } = privateTableUi(f.bootstrap);
  if (pending) await f.install();
  const bill = tableAccount();
  const scope = {
    read: (guard: () => void) =>
      readTablePaymentAccount(
        f.client,
        f.context,
        f.bootstrap,
        { visit: f.preparation.visit, sessionId: f.preparation.sessionId, currency: 'CHF' },
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
        <PlanProvider>{children}</PlanProvider>
      </QueryClientProvider>
    );
  }
  return { ...f, owner, bootstrapQuery, cache, bill, scope, Wrapper };
}
