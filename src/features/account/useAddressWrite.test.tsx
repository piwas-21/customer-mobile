import { act, renderHook } from '@testing-library/react-native';
import useAddressWrite from './useAddressWrite';
import { ApiFailure } from '../../core/transport';
import { sessionSetup } from '../../test/sessions';
import { tenantA } from '../../test/fixtures';
import { deferred } from '../../test/deferred';
it('locks synchronous double decisions and busy dismissal until one explicit write settles', async () => {
  const fixture = await sessionSetup();
  const saved = jest.fn();
  const finish = deferred<void>();
  const effect = jest.fn(() => finish.promise);
  const hook = renderHook(() => useAddressWrite(fixture.controller, tenantA, saved));
  let pending = Promise.resolve();
  await act(async () => {
    pending = hook.result.current.run(effect);
    await hook.result.current.run(effect);
  });
  expect(effect).toHaveBeenCalledTimes(1);
  expect(hook.result.current.busy).toBe(true);
  expect(hook.result.current.canLeave()).toBe(false);
  await act(async () => {
    finish.resolve();
    await pending;
  });
  expect(saved).toHaveBeenCalledTimes(1);
  expect(hook.result.current.canLeave()).toBe(true);
  hook.unmount();
});
it.each([
  new ApiFailure(0, 'network'),
  new ApiFailure(503, 'http'),
  new ApiFailure(200, 'contract'),
])('blocks repeated decisions after an unknown result %j', async (failure) => {
  const fixture = await sessionSetup();
  const saved = jest.fn();
  const effect = jest.fn<Promise<void>, []>().mockRejectedValue(failure);
  const hook = renderHook(() => useAddressWrite(fixture.controller, tenantA, saved));
  await act(async () => {
    await hook.result.current.run(effect);
  });
  expect(hook.result.current.failure).toBe('unknown');
  expect(hook.result.current.canLeave()).toBe(true);
  await act(async () => {
    await hook.result.current.run(effect);
  });
  expect(effect).toHaveBeenCalledTimes(1);
  expect(saved).not.toHaveBeenCalled();
  hook.unmount();
});
it('permits an explicit corrected request after a definitive refusal without retrying automatically', async () => {
  const fixture = await sessionSetup();
  const saved = jest.fn();
  const effect = jest
    .fn<Promise<void>, []>()
    .mockRejectedValueOnce(new ApiFailure(400, 'http'))
    .mockResolvedValueOnce();
  const hook = renderHook(() => useAddressWrite(fixture.controller, tenantA, saved));
  await act(async () => {
    await hook.result.current.run(effect);
  });
  expect(hook.result.current.failure).toBe('refused');
  expect(effect).toHaveBeenCalledTimes(1);
  await act(async () => {
    await hook.result.current.run(effect);
  });
  expect(saved).toHaveBeenCalledTimes(1);
  expect(effect).toHaveBeenCalledTimes(2);
  expect(hook.result.current.failure).toBeUndefined();
  hook.unmount();
});
it.each(['unmount', 'logout'] as const)('does not publish a late write after %s', async (mode) => {
  const fixture = await sessionSetup();
  const saved = jest.fn();
  const finish = deferred<void>();
  const effect = jest.fn(() => finish.promise);
  const hook = renderHook(() => useAddressWrite(fixture.controller, tenantA, saved));
  let pending = Promise.resolve();
  await act(async () => {
    pending = hook.result.current.run(effect);
  });
  if (mode === 'unmount') hook.unmount();
  else await fixture.controller.logout();
  await act(async () => {
    finish.resolve();
    await pending;
  });
  expect(saved).not.toHaveBeenCalled();
  if (mode === 'logout') hook.unmount();
  expect(hook.result.current.canLeave()).toBe(false);
  await act(async () => {
    await hook.result.current.run(effect);
  });
  expect(effect).toHaveBeenCalledTimes(1);
});
it('does not dispatch after the account has already been withdrawn', async () => {
  const fixture = await sessionSetup();
  await fixture.controller.logout();
  const effect = jest.fn<Promise<void>, []>();
  const saved = jest.fn();
  const hook = renderHook(() => useAddressWrite(fixture.controller, tenantA, saved));
  await act(async () => {
    await hook.result.current.run(effect);
  });
  expect(effect).not.toHaveBeenCalled();
  expect(saved).not.toHaveBeenCalled();
  hook.unmount();
});
