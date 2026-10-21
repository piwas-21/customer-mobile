import { setReservationUiRepository as install } from '../../test/reservationUiSetup';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
import { tableVisitUiFixture } from '../../test/tableVisitUi';
import { tablePaymentAccount, paymentReadOperation } from '../../test/tablePaymentAccount';
import { tableAccount } from '../../test/tableAccount';
import { response } from '../../test/transport';
import { deferred } from '../../test/deferred';
import { tableAdmissionInbox } from '../../core/tableAdmissionInbox';
import { tenantA } from '../../test/fixtures';
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: jest.fn() }),
}));
afterEach(() => {
  tableAdmissionInbox.take(tenantA);
  jest.restoreAllMocks();
});
async function fixture(
  configure: (f: Awaited<ReturnType<typeof tableVisitUiFixture>>) => void = () => {},
) {
  const f = await tableVisitUiFixture(install, true, (f) => {
    f.bootstrap.flags.tableAccountPaymentsV1 = true;
    const payment = tablePaymentAccount();
    const bill = tableAccount();
    Object.assign(bill, {
      subTotal: 14,
      total: 14,
      totalPaid: 0,
      remaining: 14,
      originalTotal: 14,
      billingCreditAmount: 0,
    });
    Object.assign(bill.orders[0]!, {
      total: 14,
      totalPaid: 0,
      remainingAmount: 14,
      payableTotal: 14,
      billingCreditAmount: 0,
    });
    bill.items[0]!.unitCount = 2;
    Object.assign(bill.items[0]!.item, { quantity: 2, unitPrice: 7, itemTotal: 14 });
    f.fetcher.mockImplementation(async (url) =>
      response({
        success: true,
        data: url.includes('/bootstrap?')
          ? f.bootstrap
          : url.includes('/table-payments/account?')
            ? payment
            : bill,
      }),
    );
  });
  configure(f);
  await f.screen.findByRole('button', { name: 'Payment details' });
  return f;
}
it('shows current server reservation amounts without a charge action, IDs or cached private payment rows', async () => {
  const f = await fixture();
  try {
    fireEvent.press(f.screen.getByRole('button', { name: 'Payment details' }));
    expect(await f.screen.findByText('Reserved by payments: CHF 7.00')).toBeTruthy();
    expect(f.screen.getByText('Not reserved: CHF 7.00')).toBeTruthy();
    expect(
      f.screen.queryByRole('button', { name: /pay now|start checkout|confirm payment/i }),
    ).toBeNull();
    expect(f.screen.queryByText(paymentReadOperation, { exact: false })).toBeNull();
    expect(f.screen.queryByLabelText(paymentReadOperation, { exact: false })).toBeNull();
    expect(
      JSON.stringify(
        f.cache
          .getQueryCache()
          .getAll()
          .map((q) => q.state.data),
      ),
    ).not.toContain(paymentReadOperation);
    const calls = f.fetcher.mock.calls.filter(([url]) => url.includes('/table-payments/account?'));
    expect(calls).toHaveLength(1);
    expect(calls[0]![1].method).toBe('GET');
    fireEvent.press(f.screen.getByRole('button', { name: 'Close' }));
    expect(f.screen.queryByText(/Reserved by payments:/)).toBeNull();
  } finally {
    f.close();
  }
});
it('does not keep a previous payment snapshot after a failed new read', async () => {
  const f = await fixture();
  try {
    fireEvent.press(f.screen.getByRole('button', { name: 'Payment details' }));
    await f.screen.findByText('Reserved by payments: CHF 7.00');
    fireEvent.press(f.screen.getByRole('button', { name: 'Close' }));
    const previous = f.fetcher.getMockImplementation()!;
    f.fetcher.mockImplementation(async (...args) =>
      args[0].includes('/table-payments/account?')
        ? response({ success: false }, 503)
        : previous(...args),
    );
    fireEvent.press(f.screen.getByRole('button', { name: 'Payment details' }));
    await f.screen.findByText(
      'Payment details could not be confirmed. Refresh your bill or ask the restaurant.',
    );
    expect(f.screen.queryByText(/Reserved by payments:/)).toBeNull();
  } finally {
    f.close();
  }
});
it('refuses a fresh payment account for a different displayed bill revision', async () => {
  const f = await fixture((f) => {
    const previous = f.fetcher.getMockImplementation()!;
    f.fetcher.mockImplementation(async (...args) => {
      if (!args[0].includes('/table-payments/account?')) return previous(...args);
      const value = tablePaymentAccount();
      value.account.accountRevision = 8;
      return response({ success: true, data: value });
    });
  });
  try {
    fireEvent.press(f.screen.getByRole('button', { name: 'Payment details' }));
    await f.screen.findByText(
      'Payment details could not be confirmed. Refresh your bill or ask the restaurant.',
    );
    expect(f.screen.queryByText(/Reserved by payments:/)).toBeNull();
    fireEvent.press(f.screen.getByRole('button', { name: 'Close and refresh bill' }));
    await f.screen.findByRole('button', { name: 'Payment details' });
  } finally {
    f.close();
  }
});
it('closing a view fences a paused secure read even when the original table actor stays alive', async () => {
  const f = await fixture();
  const entered = deferred<void>();
  const release = deferred<void>();
  const original = f.repository.vault.capability.bind(f.repository.vault);
  const spy = jest.spyOn(f.repository.vault, 'capability').mockImplementation(async (...args) => {
    if (args[1] === 'guest-session') {
      entered.resolve();
      await release.promise;
    }
    return original(...args);
  });
  try {
    fireEvent.press(f.screen.getByRole('button', { name: 'Payment details' }));
    await act(async () => entered.promise);
    fireEvent.press(f.screen.getByRole('button', { name: 'Close' }));
    await act(async () => {
      release.resolve();
    });
    await waitFor(() =>
      expect(f.fetcher.mock.calls.some(([url]) => url.includes('/table-payments/account?'))).toBe(
        false,
      ),
    );
    expect((await f.actor.saved())?.serviceSessionId).toBe(tenantA);
    spy.mockRestore();
    fireEvent.press(f.screen.getByRole('button', { name: 'Payment details' }));
    await f.screen.findByText('Reserved by payments: CHF 7.00');
  } finally {
    release.resolve();
    f.close();
  }
});
