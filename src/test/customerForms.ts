import type { CustomerForm } from '../api/customerForms';
function form(
  formKey: string,
  keys: readonly string[],
  locked: readonly string[],
  hidden: readonly string[] = [],
): CustomerForm {
  return {
    formKey,
    fields: keys.map((fieldKey, displayOrder) => ({
      fieldKey,
      displayOrder,
      isLocked: locked.includes(fieldKey),
      isRequired: locked.includes(fieldKey),
      isVisible: !hidden.includes(fieldKey),
    })),
  };
}
export function customerForms(): CustomerForm[] {
  return [
    form('checkout_contact', ['name', 'email', 'phone'], ['name', 'email'], ['phone']),
    form(
      'delivery_address',
      ['street', 'postalCode', 'city', 'country', 'additionalInfo'],
      ['street', 'postalCode', 'city'],
    ),
  ];
}
