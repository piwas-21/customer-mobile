import { checkoutFields } from './checkoutFields';
import { customerForms } from '../test/customerForms';
it('retains the dine-in contact floor and omits the default hidden phone', () => {
  expect(checkoutFields(customerForms(), 'DineIn')).toEqual({
    contact: [
      { key: 'name', required: true },
      { key: 'email', required: true },
    ],
    address: [],
  });
});
it.each(['Takeaway', 'Delivery'] as const)(
  'requires phone for %s even when admin configuration hides it',
  (type) => {
    expect(checkoutFields(customerForms(), type).contact).toEqual([
      { key: 'name', required: true },
      { key: 'email', required: true },
      { key: 'phone', required: true },
    ]);
  },
);
it.each([false, true])('adds the configured dine-in phone with required=%s', (required) => {
  const config = customerForms();
  Object.assign(config[0]!.fields[2]!, { isVisible: true, isRequired: required });
  expect(checkoutFields(config, 'DineIn').contact[2]).toEqual({ key: 'phone', required });
});
it('keeps the operational contact floor even if configuration weakens nonlocked fields', () => {
  const config = customerForms();
  for (const field of config[0]!.fields)
    Object.assign(field, { isVisible: false, isRequired: false, isLocked: false });
  expect(checkoutFields(config, 'Takeaway').contact.every((field) => field.required)).toBe(true);
  expect(checkoutFields(config, 'Takeaway').contact.map((field) => field.key)).toEqual([
    'name',
    'email',
    'phone',
  ]);
});
it('keeps the mandatory delivery address and configured optional fields in customer order', () => {
  expect(checkoutFields(customerForms(), 'Delivery').address).toEqual([
    { key: 'street', required: true },
    { key: 'postalCode', required: true },
    { key: 'city', required: true },
    { key: 'country', required: false },
    { key: 'additionalInfo', required: false },
  ]);
});
it('honors configured address requiredness and hides optional hidden values', () => {
  const config = customerForms();
  config[1]!.fields[3]!.isRequired = true;
  config[1]!.fields[4]!.isVisible = false;
  expect(checkoutFields(config, 'Delivery').address).toEqual([
    { key: 'street', required: true },
    { key: 'postalCode', required: true },
    { key: 'city', required: true },
    { key: 'country', required: true },
  ]);
});
it('needs the delivery form only when ordering delivery', () => {
  const config = customerForms().slice(0, 1);
  expect(checkoutFields(config, 'Takeaway').address).toEqual([]);
  expect(() => checkoutFields(config, 'Delivery')).toThrow('Unsupported checkout form');
});
it('refuses an absent or incomplete checkout contract rather than inventing optional defaults', () => {
  expect(() => checkoutFields([], 'Takeaway')).toThrow('Unsupported checkout form');
  const config = customerForms();
  config[0]!.fields.pop();
  expect(() => checkoutFields(config, 'Takeaway')).toThrow('Incomplete checkout form');
});
it.each([false, true])(
  'refuses a visible unsupported checkout field with required=%s',
  (required) => {
    const config = customerForms();
    config[0]!.fields.push({
      fieldKey: 'futureField',
      isVisible: true,
      isRequired: required,
      isLocked: false,
      displayOrder: 3,
    });
    expect(() => checkoutFields(config, 'Takeaway')).toThrow('Unsupported checkout form');
  },
);
it('permits unrelated future forms and hidden optional fields without losing known requirements', () => {
  const config = customerForms();
  config.push({ formKey: 'future_form', fields: [] });
  config[0]!.fields.push({
    fieldKey: 'futureField',
    isVisible: false,
    isRequired: false,
    isLocked: false,
    displayOrder: 3,
  });
  expect(checkoutFields(config, 'Takeaway').contact.map((field) => field.key)).toEqual([
    'name',
    'email',
    'phone',
  ]);
});
