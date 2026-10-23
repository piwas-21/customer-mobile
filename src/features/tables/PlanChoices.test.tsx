import '../../i18n';
import { fireEvent, render } from '@testing-library/react-native';
import { payableTableAccount } from '../../test/tableContributionReview';
import PlanChoices from './PlanChoices';
it('requires exact custom amounts and exposes accessible bounded guest controls', () => {
  const snapshot = payableTableAccount();
  snapshot.account.activeEqualSharePlan = null;
  const onReview = jest.fn();
  const view = render(<PlanChoices snapshot={snapshot} busy={false} onReview={onReview} />);
  fireEvent.press(view.getByRole('button', { name: 'Custom guest amounts' }));
  const review = () => view.getByRole('button', { name: 'Review table split' });
  expect(review()).toBeDisabled();
  fireEvent.changeText(view.getByLabelText('Guest 1 amount'), '4');
  fireEvent.changeText(view.getByLabelText('Guest 2 amount'), '5');
  fireEvent.changeText(view.getByLabelText('Guest 3 amount'), '4.99');
  expect(review()).toBeDisabled();
  fireEvent.changeText(view.getByLabelText('Guest 3 amount'), '5');
  expect(review()).not.toBeDisabled();
  fireEvent.press(review());
  expect(onReview).toHaveBeenCalledWith({
    shareCount: 3,
    customAmountsMinor: [400, 500, 500],
    supersedesPlanId: null,
  });
  fireEvent(view.getByRole('adjustable', { name: 'Number of guests' }), 'accessibilityAction', {
    nativeEvent: { actionName: 'decrement' },
  });
  expect(view.queryByLabelText('Guest 3 amount')).toBeNull();
  expect(review()).toBeDisabled();
});
it('requires explicit replacement of an owned unused split and refuses protected or foreign plans', () => {
  const snapshot = payableTableAccount();
  const plan = snapshot.account.activeEqualSharePlan!;
  plan.isOwnPlan = true;
  const onReview = jest.fn();
  const content = () => <PlanChoices snapshot={snapshot} busy={false} onReview={onReview} />;
  const view = render(content());
  const review = () => view.getByRole('button', { name: 'Review table split' });
  expect(review()).toBeDisabled();
  fireEvent.press(view.getByRole('button', { name: 'Replace my existing unused split' }));
  expect(review()).not.toBeDisabled();
  fireEvent.press(review());
  expect(onReview).toHaveBeenCalledWith({
    shareCount: 3,
    customAmountsMinor: [],
    supersedesPlanId: plan.planId,
  });
  plan.slots[0]!.claimState = 'Reserved';
  view.rerender(content());
  expect(review()).toBeDisabled();
  plan.isOwnPlan = false;
  view.rerender(content());
  expect(view.queryByRole('button', { name: 'Review table split' })).toBeNull();
});
