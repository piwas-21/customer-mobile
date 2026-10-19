import { applyCheckoutAddress } from './checkoutSavedAddress';
import { emptyCheckoutDraft, inspectCheckoutDraft } from './checkoutDraft';
import { checkoutFields } from './checkoutFields';
import { customerForms } from '../test/customerForms';
import { savedAddress } from '../test/savedAddresses';
const contact = { name: 'Customer', email: 'customer@example.test', phone: '+41000000000' };
it('preserves every delivery detail and changes contact phone only on explicit selection', () => {
  const draft = { ...emptyCheckoutDraft(), ...contact, tip: '3.50' };
  const result = applyCheckoutAddress(draft, savedAddress(1, { state: 'Geneva region' }));
  expect(result).toEqual({
    ...draft,
    street: 'Rue de la Paix 7\nFloor 2',
    city: 'Geneva, Geneva region',
    postalCode: '1201',
    country: 'CH',
    phone: '+41790000000',
    additionalInfo: 'Ring once',
  });
  expect(draft.street).toBe('');
});
it('keeps the entered contact phone when the saved address has none and clears old optional delivery details', () => {
  const draft = { ...emptyCheckoutDraft(), ...contact, additionalInfo: 'Previous door' };
  expect(
    applyCheckoutAddress(
      draft,
      savedAddress(1, {
        addressLine2: null,
        state: null,
        phone: null,
        deliveryInstructions: null,
      }),
    ),
  ).toEqual({
    ...draft,
    street: 'Rue de la Paix 7',
    city: 'Geneva',
    postalCode: '1201',
    country: 'CH',
    additionalInfo: '',
  });
});
it('never truncates combined saved fields and blocks checkout until overlong details are edited', () => {
  const draft = applyCheckoutAddress(
    { ...emptyCheckoutDraft(), ...contact },
    savedAddress(1, {
      addressLine1: 'A'.repeat(200),
      addressLine2: 'B'.repeat(200),
      city: 'C'.repeat(100),
      state: 'D'.repeat(100),
    }),
  );
  expect(draft.street).toBe('A'.repeat(200) + '\n' + 'B'.repeat(200));
  expect(draft.city).toBe('C'.repeat(100) + ', ' + 'D'.repeat(100));
  const result = inspectCheckoutDraft(draft, checkoutFields(customerForms(), 'Delivery'));
  expect(result.values).toBeNull();
  expect(result.errors).toEqual(new Set(['street', 'city']));
});
