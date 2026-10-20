import { emptyCheckoutDraft, inspectCheckoutDraft } from './checkoutDraft';
import { checkoutFields } from './checkoutFields';
import { customerForms } from '../test/customerForms';
const contact = () => ({
  ...emptyCheckoutDraft(),
  name: 'Guest',
  email: 'native@example.test',
  phone: '+41000000000',
});
it('preserves mandatory contact and decimal tip while ignoring optional delivery fields for takeaway', () => {
  const fields = checkoutFields(customerForms(), 'Takeaway');
  expect(inspectCheckoutDraft(emptyCheckoutDraft(), fields).values).toBeNull();
  expect([...inspectCheckoutDraft(emptyCheckoutDraft(), fields).errors]).toEqual([
    'name',
    'email',
    'phone',
  ]);
  expect(inspectCheckoutDraft({ ...contact(), tip: '3,50' }, fields).values).toEqual({
    contact: { name: 'Guest', email: 'native@example.test', phone: '+41000000000' },
    address: undefined,
    tip: 3.5,
    pointsToRedeem: 0,
  });
  expect(inspectCheckoutDraft(contact(), fields).values?.tip).toBe(0);
});
it.each(['-1', '1.001', '1e2', '1 000', 'invalid', '100000000', 'Infinity'])(
  'refuses unsupported tip input %s',
  (tip) => {
    const parsed = inspectCheckoutDraft(
      { ...contact(), tip },
      checkoutFields(customerForms(), 'Takeaway'),
    );
    expect(parsed.errors.has('tip')).toBe(true);
    expect(parsed.values).toBeNull();
  },
);
it('requires current delivery floors and configured optional values without inventing country', () => {
  const draft = { ...contact(), street: 'Street', city: 'City', postalCode: '1000' };
  const config = customerForms();
  expect(
    inspectCheckoutDraft(draft, checkoutFields(config, 'Delivery')).values?.address?.country,
  ).toBe('');
  const country = config
    .find((value) => value.formKey === 'delivery_address')!
    .fields.find((value) => value.fieldKey === 'country')!;
  country.isRequired = true;
  expect(
    inspectCheckoutDraft(draft, checkoutFields(config, 'Delivery')).errors.has('country'),
  ).toBe(true);
  expect(
    inspectCheckoutDraft(
      { ...draft, country: 'CH', street: '' },
      checkoutFields(config, 'Delivery'),
    ).errors.has('street'),
  ).toBe(true);
  expect(
    inspectCheckoutDraft({ ...draft, country: 'CH' }, checkoutFields(config, 'Delivery')).values
      ?.address?.street,
  ).toBe('Street');
});

it.each(['-1', '1.5', '1,5', '1e2', '1 000', 'Infinity', '2147483648', '00000000000', 'invalid'])(
  'refuses unsupported loyalty point input %s',
  (pointsToRedeem) => {
    const result = inspectCheckoutDraft(
      { ...contact(), pointsToRedeem },
      checkoutFields(customerForms(), 'Takeaway'),
    );
    expect(result.errors.has('pointsToRedeem')).toBe(true);
    expect(result.values).toBeNull();
  },
);
it.each([
  ['', 0],
  ['0', 0],
  [' 100 ', 100],
  ['2147483647', 2147483647],
] as const)(
  'accepts whole requested points %s without computing a monetary value',
  (pointsToRedeem, expected) => {
    expect(
      inspectCheckoutDraft(
        { ...contact(), pointsToRedeem },
        checkoutFields(customerForms(), 'Takeaway'),
      ).values?.pointsToRedeem,
    ).toBe(expected);
  },
);
