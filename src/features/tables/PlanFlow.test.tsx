import '../../i18n';
import '../../test/reservationUiSetup';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { tablePlanUiFixture } from '../../test/tablePlanUi';
import PlanModal from './PlanModal';
import PlanNotice from './PlanNotice';
import { tablePlanPath } from '../../core/tablePlanRequest';
it.each([false, true])(
  'reviews every ordered amount before one explicit split creation (custom=%s)',
  async (custom) => {
    const f = await tablePlanUiFixture();
    const view = render(
      <>
        <PlanNotice />
        <PlanModal scope={f.scope} onClose={jest.fn()} />
      </>,
      { wrapper: f.Wrapper },
    );
    try {
      const review = await view.findByRole('button', { name: 'Review table split' });
      await waitFor(() => expect(review).not.toBeDisabled());
      if (custom) {
        fireEvent.press(view.getByRole('button', { name: 'Custom guest amounts' }));
        fireEvent.changeText(view.getByLabelText('Guest 1 amount'), '4');
        fireEvent.changeText(view.getByLabelText('Guest 2 amount'), '5');
        fireEvent.changeText(view.getByLabelText('Guest 3 amount'), '5');
      }
      fireEvent.press(view.getByRole('button', { name: 'Review table split' }));
      const confirm = await view.findByRole('button', { name: 'Create this split' });
      expect(view.getByText('Available balance: CHF 14.00')).toBeTruthy();
      for (const [index, amount] of (custom
        ? ['4.00', '5.00', '5.00']
        : ['4.65', '4.65', '4.70']
      ).entries())
        expect(view.getByText(`Guest ${index + 1}: CHF ${amount}`)).toBeTruthy();
      expect(f.paths().filter((path) => path.endsWith('/submit'))).toHaveLength(0);
      await waitFor(() => expect(confirm).not.toBeDisabled());
      fireEvent.press(confirm);
      expect(await view.findByText(/Your split was created/)).toBeTruthy();
      expect(f.paths().filter((path) => path === tablePlanPath + '/submit')).toHaveLength(1);
      expect(f.paths().some((path) => /checkout|table-payments\/contributions/.test(path))).toBe(
        false,
      );
      const cached = JSON.stringify(
        f.cache
          .getQueryCache()
          .getAll()
          .map((q) => q.state.data),
      );
      expect(cached).not.toMatch(/ownerProof|payloadHash|participantToken/);
    } finally {
      view.unmount();
      f.cache.clear();
    }
  },
);
it('retains the original split after rollout withdrawal and requires explicit stopping confirmation', async () => {
  const f = await tablePlanUiFixture(true, true);
  f.bootstrap.capabilities['table-payments'] = 'disabled';
  const view = render(<PlanNotice />, { wrapper: f.Wrapper });
  try {
    const stop = await view.findByRole('button', { name: 'Stop this split request' });
    await waitFor(() => expect(stop).not.toBeDisabled());
    fireEvent.press(stop);
    expect(f.paths().filter((path) => path.endsWith('/stop'))).toHaveLength(0);
    fireEvent.press(view.getByRole('button', { name: 'Stop and check this request' }));
    expect(await view.findByText(/This split request was stopped/)).toBeTruthy();
    const done = view.getByRole('button', { name: 'Done' });
    await waitFor(() => expect(done).not.toBeDisabled());
    fireEvent.press(done);
    await waitFor(async () => expect(await f.actor.saved()).toBeNull());
  } finally {
    view.unmount();
    f.cache.clear();
  }
});
