import { cancellationControllerFixture } from '../test/cancellationController';
import { CustomerCancellationController } from './customerCancellationController';
it.each(['set', 'ack'] as const)(
  'recovers the original canonical decision after terminal persistence %s failure',
  async (failure) => {
    const f = await cancellationControllerFixture();
    f.fetcher.mockResolvedValueOnce(f.reply(f.preparation)).mockResolvedValue(f.reply(f.canonical));
    await f.offer();
    const set = f.store.set;
    const get = f.store.get;
    let terminalWritten = false;
    const save = jest.spyOn(f.store, 'set').mockImplementation(async (key, value) => {
      if (key.endsWith('.order-cancellation') && !value.includes('"resolution":null')) {
        if (failure === 'set') throw new Error('secure store locked');
        terminalWritten = true;
      }
      await set(key, value);
    });
    const read = jest.spyOn(f.store, 'get').mockImplementation((key) => {
      if (failure === 'ack' && terminalWritten && key.endsWith('.order-cancellation'))
        return Promise.reject(new Error('acknowledgement lost'));
      return get(key);
    });
    await expect(f.controller.confirm(f.record.intent.orderId, 'en')).rejects.toThrow();
    save.mockRestore();
    read.mockRestore();
    if (failure === 'set')
      expect(await f.repository.orders.hasUnresolvedPurchase(f.context, f.principal, f.guard)).toBe(
        true,
      );
    const restarted = new CustomerCancellationController(
      f.context,
      f.client,
      f.repository,
      f.sessions,
      f.principal,
      f.createId,
      true,
    );
    expect(await restarted.recover('en')).toMatchObject({
      operationId: f.record.intent.operationId,
      outcome: 'Cancelled',
    });
    expect(await f.repository.orders.hasUnresolvedPurchase(f.context, f.principal, f.guard)).toBe(
      false,
    );
    expect(f.createId).toHaveBeenCalledTimes(1);
    expect(f.fetcher.mock.calls.filter(([url]) => url.endsWith('/submit'))).toHaveLength(1);
    expect(f.fetcher.mock.calls.filter(([url]) => url.endsWith('/recover'))).toHaveLength(
      failure === 'set' ? 1 : 0,
    );
  },
);
