import { act, renderHook } from '@testing-library/react-native';
import { z } from 'zod';
import useAccountRequest from './useAccountRequest';
const schema = z.object({ email: z.email() });
it('ignores duplicate submits and late completions after unmount', async () => {
  let finish: () => void = () => {
    throw new Error('Gate unavailable');
  };
  const send = jest.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const settled = jest.fn();
  const hook = renderHook(() => useAccountRequest(schema, send, settled));
  const submit = hook.result.current.submit;
  let pending: Promise<boolean> = Promise.resolve(false);
  await act(async () => {
    pending = submit({ email: 'guest@example.test' });
    expect(await submit({ email: 'guest@example.test' })).toBe(false);
  });
  expect(hook.result.current.busy).toBe(true);
  expect(send).toHaveBeenCalledTimes(1);
  hook.unmount();
  finish();
  expect(await pending).toBe(false);
  expect(await submit({ email: 'guest@example.test' })).toBe(false);
  expect(settled).not.toHaveBeenCalled();
});
it('does not dispatch invalid input and clears busy after a failed request', async () => {
  const send = jest.fn().mockRejectedValue(new Error('Offline'));
  const settled = jest.fn();
  const hook = renderHook(() => useAccountRequest(schema, send, settled));
  await act(async () => {
    expect(await hook.result.current.submit({ email: '' })).toBe(false);
  });
  expect(hook.result.current.failure).toBe('input');
  expect(send).not.toHaveBeenCalled();
  await act(async () => {
    expect(await hook.result.current.submit({ email: 'guest@example.test' })).toBe(false);
  });
  expect(hook.result.current.failure).toBe('request');
  expect(hook.result.current.busy).toBe(false);
  expect(settled).toHaveBeenCalledTimes(1);
  hook.unmount();
});
