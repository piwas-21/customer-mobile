import '../../i18n';
import '../../test/reservationUiSetup';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { tablePlanUiFixture } from '../../test/tablePlanUi';
import { deferred } from '../../test/deferred';
import PlanModal from './PlanModal';
it.each(['owner', 'rollout', 'background'])(
  'withdraws a paused split review after %s',
  async (mode) => {
    const f = await tablePlanUiFixture(true);
    const entered = deferred<void>();
    const release = deferred<void>();
    const normal = f.fetcher.getMockImplementation()!;
    f.fetcher.mockImplementation(async (url, options) => {
      if (url.endsWith('/prepare')) {
        entered.resolve();
        await release.promise;
      }
      return normal(url, options);
    });
    const content = <PlanModal scope={f.scope} onClose={jest.fn()} />;
    const view = render(content, { wrapper: f.Wrapper });
    try {
      const review = await view.findByRole('button', { name: 'Review table split' });
      await waitFor(() => expect(review).not.toBeDisabled());
      fireEvent.press(review);
      await entered.promise;
      await act(async () => {
        if (mode === 'owner') f.owner.ownerVersion += ':new';
        if (mode === 'rollout')
          f.bootstrapQuery.data = {
            ...f.bootstrap,
            capabilities: { ...f.bootstrap.capabilities, 'table-payments': 'disabled' },
          };
        if (mode === 'background')
          for (const [event, listener] of jest.mocked(AppState.addEventListener).mock.calls)
            if (event === 'change') listener('background');
        view.rerender(content);
        release.resolve();
      });
      await waitFor(() =>
        expect(view.queryByRole('button', { name: 'Create this split' })).toBeNull(),
      );
      expect(f.paths().filter((path) => path.endsWith('/submit'))).toHaveLength(0);
      expect(await f.actor.saved()).toBeNull();
    } finally {
      release.resolve();
      view.unmount();
      f.cache.clear();
    }
  },
);
