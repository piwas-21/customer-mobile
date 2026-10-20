import { mockWorkspaceOwner } from './workspaceOwner';
import type { PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CancellationProvider from '../features/orders/CancellationProvider';
import useBootstrap from '../features/restaurant/useBootstrap';
import type useOrderReceipts from '../features/orders/useOrderReceipts';
import { savedOrderFixture, receiptResponse } from './orderReceipt';
import { basketResponse } from './basketApi';
import { response } from './transport';
export async function cancellationUiFixture(customer = false) {
  const f = await savedOrderFixture(customer);
  const receipt = { ...receiptResponse(), status: 'PendingApproval' };
  const preparation = {
    schemaVersion: 1 as const,
    orderId: receipt.orderId,
    expectedVersion: 7,
    allowed: true,
    reason: null,
    payloadHash: 'c'.repeat(64),
  };
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const state = mockWorkspaceOwner(f);
  jest.mocked(useBootstrap).mockReturnValue({
    data: {
      schemaVersion: 1,
      tenantId: f.context.tenant.id,
      currency: 'CHF',
      locale: 'en',
      timezone: 'Europe/Zurich',
      lifecycle: 'active',
      compatibility: 'supported',
      modules: [],
      flags: {},
      capabilities: { menu: 'enabled', ordering: 'enabled' },
    },
  } as unknown as ReturnType<typeof useBootstrap>);
  let outcome: 'Cancelled' | 'Unseen' | 'Refused' | 'network' = 'Cancelled';
  f.fetcher.mockImplementation(async (url, options) => {
    if (url.includes('/cancellation')) {
      if (url.includes('prepare') || options.method === 'GET')
        return response({ success: true, data: preparation });
      if (outcome === 'network') throw new Error('lost response');
      const body: unknown = JSON.parse(options.body ?? '{}');
      const parsed = body as { intent?: { operationId: string }; operationId?: string };
      return response({
        success: true,
        data: {
          schemaVersion: 1,
          operationId: parsed.intent?.operationId ?? parsed.operationId,
          orderId: receipt.orderId,
          outcome,
          observedVersion: outcome === 'Unseen' ? null : 8,
          reason: outcome === 'Refused' ? 'OrderChanged' : null,
        },
      });
    }
    return response({
      success: true,
      data: url.includes('/basket') ? basketResponse(customer ? f.principal.id : null) : receipt,
    });
  });
  const close = jest.fn();
  const orders: ReturnType<typeof useOrderReceipts> = {
    session: state,
    reader: undefined,
    items: undefined,
    loading: false,
    failed: false,
    busy: false,
    actionFailed: false,
    selected: f.decision.operationId,
    item: { ...f.decision, orderId: f.decision.orderId, recordedAt: null },
    receipt,
    receiptLoading: false,
    receiptFailed: false,
    select: jest.fn(),
    close,
    refresh: jest.fn(),
    refreshReceipt: jest.fn(),
    forget: jest.fn(async () => {}),
    canContinueAsGuest: false,
    continueAsGuest: jest.fn(async () => {}),
  };
  function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={cache}>
        <CancellationProvider>{children}</CancellationProvider>
      </QueryClientProvider>
    );
  }
  return {
    ...f,
    receipt,
    preparation,
    orders,
    close,
    state,
    cache,
    Wrapper,
    setOutcome: (value: typeof outcome) => {
      outcome = value;
    },
  };
}
