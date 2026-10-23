import '../../i18n';
import '../../test/reservationUiSetup';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { tableContributionUiFixture } from '../../test/tableContributionUi';
import ContributionModal from './ContributionModal';
import ContributionNotice from './ContributionNotice';
import { tableContributionPath } from '../../core/tableContributionRequest';
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));
jest.mock('../../config', () => {
  const { fixtureDirectory } =
    jest.requireActual<typeof import('../../test/fixtures')>('../../test/fixtures');
  return { runtimeConfig: { hostedCheckoutOrigins: [fixtureDirectory().tenants[0]!.webOrigin] } };
});
it.each(['Full', 'Amount', 'Items', 'Equal', 'CustomAmount'])(
  'reviews exact %s money before one submission and never accepts browser success as payment',
  async (mode) => {
    const f = await tableContributionUiFixture(false, mode === 'CustomAmount');
    const view = render(
      <>
        <ContributionNotice />
        <ContributionModal scope={f.scope} bill={f.bill} onClose={jest.fn()} />
      </>,
      { wrapper: f.Wrapper },
    );
    try {
      const labels = {
        Full: 'Pay the available balance',
        Amount: 'Choose an amount',
        Items: 'Choose dishes to pay for',
        Equal: 'Pay an equal share',
        CustomAmount: 'Pay a custom share',
      };
      const choose = await view.findByRole('button', { name: labels[mode as keyof typeof labels] });
      await waitFor(() => expect(choose).not.toBeDisabled());
      fireEvent.press(choose);
      if (mode === 'Amount') fireEvent.changeText(view.getByLabelText('Amount to pay'), '3.50');
      if (mode === 'Items') fireEvent.press(view.getByRole('button', { name: /Meal · portion 2/ }));
      if (mode === 'Equal' || mode === 'CustomAmount')
        fireEvent.press(view.getByRole('button', { name: /Part 2:/ }));
      const review = view.getByRole('button', { name: 'Review payment' });
      expect(review).not.toBeDisabled();
      fireEvent.press(review);
      const confirm = await view.findByRole('button', { name: 'Continue to secure payment' });
      const money =
        mode === 'Full'
          ? '14.00'
          : mode === 'Amount'
            ? '3.50'
            : mode === 'CustomAmount'
              ? '4.00'
              : '7.00';
      expect(view.getByText(`CHF ${money}`)).toBeTruthy();
      expect(f.paths().filter((path) => path.endsWith('/submit'))).toHaveLength(0);
      await waitFor(() => expect(confirm).not.toBeDisabled());
      fireEvent.press(confirm);
      await waitFor(() => expect(f.openBrowser).toHaveBeenCalledTimes(1));
      await waitFor(() =>
        expect(view.getByRole('button', { name: 'Check this table payment' })).not.toBeDisabled(),
      );
      expect(view.queryByText(/Your payment.*is confirmed/)).toBeNull();
      expect(f.paths().filter((path) => path === tableContributionPath + '/submit')).toHaveLength(
        1,
      );
      const cached = JSON.stringify(
        f.cache
          .getQueryCache()
          .getAll()
          .map((q) => q.state.data),
      );
      expect(cached).not.toMatch(/ownerProof|payloadHash|participantToken/);
      expect(cached).not.toContain(f.hostedUrl);
    } finally {
      view.unmount();
      f.cache.clear();
    }
  },
);
it('keeps original recovery after rollout withdrawal and requires explicit stopping confirmation', async () => {
  const f = await tableContributionUiFixture(true, false, true);
  f.bootstrap.capabilities['table-payments'] = 'disabled';
  const view = render(<ContributionNotice />, { wrapper: f.Wrapper });
  try {
    const stop = await view.findByRole('button', { name: 'Stop this payment attempt' });
    await waitFor(() => expect(stop).not.toBeDisabled());
    fireEvent.press(stop);
    expect(f.paths().filter((path) => path.endsWith('/stop'))).toHaveLength(0);
    fireEvent.press(view.getByRole('button', { name: 'Confirm stop for this payment' }));
    expect(await view.findByText(/This payment attempt was stopped/)).toBeTruthy();
    await waitFor(() => expect(view.getByRole('button', { name: 'Done' })).not.toBeDisabled());
    fireEvent.press(view.getByRole('button', { name: 'Done' }));
    await waitFor(async () => expect(await f.actor.saved()).toBeNull());
  } finally {
    view.unmount();
    f.cache.clear();
  }
});
