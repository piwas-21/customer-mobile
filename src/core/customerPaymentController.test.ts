import { paymentControllerFixture, paymentReply } from '../test/paymentController';
import { paymentDecision } from '../test/customerPayment';
import { response } from '../test/transport';
import { deferred } from '../test/deferred';
import { tenantB } from '../test/fixtures';
import { secretKey } from './credentials';
beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-20T11:00:00Z')));
afterEach(() => jest.restoreAllMocks());
it.each([false, true])(
  'persists the original pending decision before opening, customer=%s',
  async (customer) => {
    const f = await paymentControllerFixture(customer);
    f.fetcher
      .mockResolvedValueOnce(paymentReply('ready'))
      .mockResolvedValueOnce(paymentReply('pending'));
    f.browser.mockImplementation(async () => {
      const saved = await f.repository.payments.load(
        f.context,
        f.principal,
        f.controller.assertCurrent,
      );
      expect(saved?.state).toBe('pending');
      expect(saved?.expiresAt).toBe(paymentDecision('ready').expiresAt);
      expect(saved?.proof).toEqual(f.record.proof);
      return { type: 'success', url: 'https://evil.example.test?paid=true' };
    });
    const value = await f.controller.open('en');
    expect(f.browser).toHaveBeenCalledWith(paymentDecision('ready').checkoutUrl);
    expect(f.fetcher).toHaveBeenCalledTimes(2);
    expect(new Set(f.fetcher.mock.calls.map(([, options]) => options.body)).size).toBe(1);
    expect(value).toEqual({
      operationId: f.pending.operationId,
      orderId: f.record.orderId,
      state: 'pending',
      canOpen: false,
    });
    expect(JSON.stringify(value)).not.toContain('checkoutUrl');
  },
);
it.each(['paid', 'expired', 'failed'] as const)(
  'publishes only canonical %s and never opens a browser',
  async (state) => {
    const f = await paymentControllerFixture();
    f.fetcher.mockResolvedValue(paymentReply(state));
    expect((await f.controller.open('en'))?.state).toBe(state);
    expect((await f.controller.saved())?.state).toBe(state);
    expect(f.browser).not.toHaveBeenCalled();
  },
);
it('coalesces duplicate browser actions and allows foreground recovery while the browser is open', async () => {
  const f = await paymentControllerFixture();
  const entered = deferred<void>();
  const browserReply = deferred<unknown>();
  f.fetcher.mockResolvedValueOnce(paymentReply('ready')).mockResolvedValue(paymentReply('paid'));
  f.browser.mockImplementation(async () => {
    entered.resolve();
    return browserReply.promise;
  });
  const first = f.controller.open('en');
  const second = f.controller.open('en');
  expect(first).toBe(second);
  await entered.promise;
  expect((await f.controller.recover('en'))?.state).toBe('paid');
  browserReply.resolve({ type: 'cancel' });
  expect((await first)?.state).toBe('paid');
  expect(f.browser).toHaveBeenCalledTimes(1);
});
it('a launch failure still checks the same attempt and never treats browser result as payment', async () => {
  const f = await paymentControllerFixture();
  f.fetcher
    .mockResolvedValueOnce(paymentReply('ready'))
    .mockResolvedValueOnce(paymentReply('paid'));
  f.browser.mockRejectedValueOnce(new Error('Browser unavailable'));
  await expect(f.controller.open('en')).rejects.toThrow('Browser unavailable');
  expect((await f.controller.saved())?.state).toBe('paid');
  expect(f.fetcher).toHaveBeenCalledTimes(2);
});
it.each(['url', 'deadline', 'no-ack'] as const)(
  'never opens without approved live URL and durable acknowledgement: %s',
  async (scenario) => {
    const f = await paymentControllerFixture();
    if (scenario === 'deadline')
      jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-21T00:00:00Z'));
    if (scenario === 'no-ack') {
      const original = f.store.set;
      jest.spyOn(f.store, 'set').mockImplementation(async (key, value) => {
        if (key === secretKey(f.context, 'payment', f.principal))
          throw new Error('Storage unavailable');
        await original(key, value);
      });
    }
    f.fetcher.mockResolvedValue(
      response({
        success: true,
        data: {
          ...paymentDecision('ready'),
          ...(scenario === 'url' ? { checkoutUrl: 'https://evil.example.test' } : {}),
        },
      }),
    );
    await expect(f.controller.open('en')).rejects.toThrow();
    expect(f.browser).not.toHaveBeenCalled();
    expect((await f.controller.saved())?.state).toBe('pending');
  },
);
it.each(['logout', 'tenant', 'dispose'] as const)(
  'late canonical payment cannot publish after %s',
  async (change) => {
    const f = await paymentControllerFixture(true);
    const entered = deferred<void>();
    const reply = deferred<Response>();
    f.fetcher.mockImplementation(async () => {
      entered.resolve();
      return reply.promise;
    });
    const pending = f.controller.recover('en');
    await entered.promise;
    if (change === 'logout') await f.sessions.logout();
    else if (change === 'tenant') f.boundary.select(tenantB);
    else f.controller.dispose();
    reply.resolve(paymentReply('paid'));
    await expect(pending).rejects.toThrow();
    expect(f.browser).not.toHaveBeenCalled();
    const record = JSON.parse((await f.store.get(secretKey(f.context, 'payment', f.principal)))!);
    expect(record.state).toBe('pending');
  },
);
it('has no browser or network work when no payment is retained', async () => {
  const f = await paymentControllerFixture();
  await f.store.remove(secretKey(f.context, 'payment', f.principal));
  await expect(f.controller.saved()).resolves.toBeNull();
  await expect(f.controller.recover('en')).resolves.toBeNull();
  await expect(f.controller.open('en')).resolves.toBeNull();
  expect(f.fetcher).not.toHaveBeenCalled();
  expect(f.browser).not.toHaveBeenCalled();
});
it('exposes only a safe action flag for a canonical approved ready decision', async () => {
  const f = await paymentControllerFixture();
  f.fetcher.mockResolvedValue(paymentReply('ready'));
  expect((await f.controller.recover('en'))?.canOpen).toBe(true);
  expect(f.browser).not.toHaveBeenCalled();
  f.fetcher.mockResolvedValue(
    response({
      success: true,
      data: { ...paymentDecision('ready'), checkoutUrl: 'https://evil.example.test' },
    }),
  );
  expect((await f.controller.recover('en'))?.canOpen).toBe(false);
});
