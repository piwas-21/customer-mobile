import '../i18n';
import { fireEvent, render } from '@testing-library/react-native';
import { checkoutFields } from '../domain/checkoutFields';
import { customerForms } from './customerForms';
import { basketState } from './basketState';
import { basketResponse } from './basketApi';
import { checkoutQuote } from './checkoutQuote';
import CheckoutControl from '../features/basket/CheckoutControl';
import useCheckoutFields from '../features/basket/useCheckoutFields';
export function configureCheckoutUiFields() {
  jest.mocked(useCheckoutFields).mockImplementation(
    (_open, type) =>
      ({
        fields: type ? checkoutFields(customerForms(), type) : null,
        isPending: false,
        refetch: jest.fn(),
      }) as unknown as ReturnType<typeof useCheckoutFields>,
  );
}
export function checkoutUiFixture(
  type: 'Takeaway' | 'Delivery' = 'Takeaway',
  canRedeemPoints = false,
) {
  const quote = checkoutQuote();
  quote.type = type;
  if (type === 'Delivery') quote.availablePaymentMethods = ['Cash'];
  quote.money.tip = 0;
  quote.money.total = 14;
  const basket = basketState({
    basket: { ...basketResponse(), orderType: type },
    quote: jest.fn(async () => quote),
    canRedeemPoints,
  });
  const screen = render(<CheckoutControl basket={basket} />);
  const enter = () => {
    fireEvent.press(screen.getByRole('button', { name: 'Checkout' }));
    fireEvent.changeText(screen.getByLabelText('Full name'), 'Native guest');
    fireEvent.changeText(screen.getByLabelText('Email'), 'native@example.test');
    fireEvent.changeText(screen.getByLabelText('Phone number'), '+41000000000');
  };
  return { basket, screen, quote, enter };
}
