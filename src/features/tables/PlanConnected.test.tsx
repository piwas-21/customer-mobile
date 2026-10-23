import '../../i18n';
import '../../test/reservationUiSetup';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { tablePlanUiFixture } from '../../test/tablePlanUi';
import { response } from '../../test/transport';
import { deferred } from '../../test/deferred';
import PlanControl from './PlanControl';
import PlanNotice from './PlanNotice';
import useTableVisit from './useTableVisit';
function ConnectedTable() {
  const flow = useTableVisit();
  return (
    <>
      <PlanNotice />
      <PlanControl flow={flow} />
    </>
  );
}
it('keeps split confirmation mounted without invalidating its parent table bill during preparation', async () => {
  const f = await tablePlanUiFixture();
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
    const entry = await view.findByRole('button', { name: 'Create a table split' });
    await waitFor(() => expect(entry).not.toBeDisabled());
    fireEvent.press(entry);
    const review = await view.findByRole('button', { name: 'Review table split' });
    await waitFor(() => expect(review).not.toBeDisabled());
    const readsBefore = billReads;
    expect(readsBefore).toBeGreaterThan(0);
    fireEvent.press(review);
    const confirm = await view.findByRole('button', { name: 'Create this split' });
    await waitFor(() => expect(confirm).not.toBeDisabled());
    await act(async () => {
      await new Promise<void>((done) => setTimeout(done, 40));
    });
    expect(billReads).toBe(readsBefore);
    expect(view.getByRole('button', { name: 'Create this split' })).not.toBeDisabled();
    fireEvent.press(confirm);
    await waitFor(() => expect(f.state.accepted).toBe(true));
  } finally {
    release.resolve();
    view.unmount();
    f.cache.clear();
  }
});
