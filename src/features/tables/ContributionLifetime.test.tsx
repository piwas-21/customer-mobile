import '../../i18n';
import '../../test/reservationUiSetup';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { tableContributionUiFixture } from '../../test/tableContributionUi';
import { deferred } from '../../test/deferred';
import ContributionModal from './ContributionModal';
import ContributionNotice from './ContributionNotice';
import { tableContributionPath } from '../../core/tableContributionRequest';
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));
jest.mock('../../config', () => {
  const { fixtureDirectory } =
    jest.requireActual<typeof import('../../test/fixtures')>('../../test/fixtures');
  return { runtimeConfig: { hostedCheckoutOrigins: [fixtureDirectory().tenants[0]!.webOrigin] } };
});
it.each(['owner', 'rollout', 'background'])(
  'withdraws a paused visible review after %s',
  async (mode) => {
    const f = await tableContributionUiFixture(true);
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
    const content = <ContributionModal scope={f.scope} bill={f.bill} onClose={jest.fn()} />;
    const view = render(content, { wrapper: f.Wrapper });
    try {
      const review = await view.findByRole('button', { name: 'Review payment' });
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
        expect(view.queryByRole('button', { name: 'Continue to secure payment' })).toBeNull(),
      );
      expect(f.paths().filter((path) => path === tableContributionPath + '/submit')).toHaveLength(
        0,
      );
      expect(await f.actor.saved()).toBeNull();
    } finally {
      release.resolve();
      view.unmount();
      f.cache.clear();
    }
  },
);
it('foregrounding during the browser recovers the original canonical payment without another submit or browser launch', async () => {
  const f = await tableContributionUiFixture();
  const entered = deferred<void>();
  const release = deferred<void>();
  f.openBrowser.mockImplementation(async () => {
    entered.resolve();
    await release.promise;
  });
  const view = render(
    <>
      <ContributionNotice />
      <ContributionModal scope={f.scope} bill={f.bill} onClose={jest.fn()} />
    </>,
    { wrapper: f.Wrapper },
  );
  try {
    const review = await view.findByRole('button', { name: 'Review payment' });
    await waitFor(() => expect(review).not.toBeDisabled());
    fireEvent.press(review);
    const confirm = await view.findByRole('button', { name: 'Continue to secure payment' });
    await waitFor(() => expect(confirm).not.toBeDisabled());
    fireEvent.press(confirm);
    await entered.promise;
    await act(async () => {
      for (const [event, listener] of jest.mocked(AppState.addEventListener).mock.calls)
        if (event === 'change') listener('background');
    });
    await act(async () => {
      for (const [event, listener] of jest.mocked(AppState.addEventListener).mock.calls)
        if (event === 'change') listener('active');
      release.resolve();
    });
    const check = await view.findByRole('button', { name: 'Check this table payment' });
    await waitFor(() => expect(check).not.toBeDisabled());
    expect(f.openBrowser).toHaveBeenCalledTimes(1);
    expect(f.paths().filter((path) => path === tableContributionPath + '/submit')).toHaveLength(1);
    expect((await f.actor.saved())?.state).toBe('pending');
    expect(view.queryByText(/Your payment.*is confirmed/)).toBeNull();
  } finally {
    release.resolve();
    view.unmount();
    f.cache.clear();
  }
});
