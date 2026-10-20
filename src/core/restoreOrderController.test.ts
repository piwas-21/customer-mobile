import { restoreOrderController } from './restoreOrderController';
import { deferred } from '../test/deferred';
it.each([false, true])(
  'never publishes a late restored controller after effect withdrawal (failed=%s)',
  async (failed) => {
    const read = deferred<unknown>();
    const controller = { saved: () => read.promise, dispose: jest.fn() };
    const ready = jest.fn();
    const cleanup = restoreOrderController(controller, ready);
    cleanup();
    if (failed) read.reject(new Error('secure store unavailable'));
    else read.resolve(null);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(ready).not.toHaveBeenCalled();
    expect(controller.dispose).toHaveBeenCalledTimes(1);
  },
);
