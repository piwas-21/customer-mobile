import '../../i18n';
import '../../test/reservationUiSetup';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { tableContributionUiFixture } from '../../test/tableContributionUi';
import { response } from '../../test/transport';
import { deferred } from '../../test/deferred';
import ContributionControl from './ContributionControl';
import ContributionNotice from './ContributionNotice';
import useTableVisit from './useTableVisit';
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));
jest.mock('../../config', () => {
  const { fixtureDirectory } =
    jest.requireActual<typeof import('../../test/fixtures')>('../../test/fixtures');
  return { runtimeConfig: { hostedCheckoutOrigins: [fixtureDirectory().tenants[0]!.webOrigin] } };
});
function ConnectedTable() {
  const flow = useTableVisit();
  return (
    <>
      <ContributionNotice />
      <ContributionControl flow={flow} />
    </>
  );
}
it('keeps a prepared quote confirmable in the actual table control without invalidating and unmounting its bill', async () => {
  const f = await tableContributionUiFixture();
  const release = deferred<void>();
  const normal = f.fetcher.getMockImplementation()!;
  let billReads = 0;
  f.fetcher.mockImplementation(async (url, options) => {
    if (new URL(url).pathname.startsWith('/api/table-guest-visits/') && url.includes('/account')) {
      billReads++;
      if (billReads > 1) await release.promise;
      return response({ success: true, data: f.bill });
    }
    return normal(url, options);
  });
  const view = render(<ConnectedTable />, { wrapper: f.Wrapper });
  try {
    const entry = await view.findByRole('button', { name: 'Pay towards your table' });
    await waitFor(() => expect(entry).not.toBeDisabled());
    fireEvent.press(entry);
    const review = await view.findByRole('button', { name: 'Review payment' });
    await waitFor(() => expect(review).not.toBeDisabled());
    const readsBefore = billReads;
    expect(readsBefore).toBeGreaterThan(0);
    fireEvent.press(review);
    const confirm = await view.findByRole('button', { name: 'Continue to secure payment' });
    await waitFor(() => expect(confirm).not.toBeDisabled());
    await act(async () => {
      await new Promise<void>((done) => setTimeout(done, 40));
    });
    expect(billReads).toBe(readsBefore);
    expect(view.getByRole('button', { name: 'Continue to secure payment' })).not.toBeDisabled();
    fireEvent.press(confirm);
    await waitFor(() => expect(f.openBrowser).toHaveBeenCalledTimes(1));
  } finally {
    release.resolve();
    view.unmount();
    f.cache.clear();
  }
});
