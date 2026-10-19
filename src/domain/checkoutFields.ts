import { customerFormsSchema, type CustomerForm } from '../api/customerForms';
import { orderTypeSchema, type OrderType } from '../api/orderType';
const contactFields = ['name', 'email', 'phone'] as const;
const addressFields = ['street', 'postalCode', 'city', 'country', 'additionalInfo'] as const;
export type ContactField = (typeof contactFields)[number];
export type AddressField = (typeof addressFields)[number];
export type CheckoutField<Key extends string> = Readonly<{ key: Key; required: boolean }>;
export type CheckoutFields = Readonly<{
  contact: readonly CheckoutField<ContactField>[];
  address: readonly CheckoutField<AddressField>[];
}>;
function fieldsFor<Key extends string>(
  forms: readonly CustomerForm[],
  formKey: string,
  keys: readonly Key[],
  floor: readonly Key[],
): CheckoutField<Key>[] {
  const supported = new Set<string>(keys);
  const form = forms.find((item) => item.formKey === formKey);
  if (!form || form.fields.some((field) => !supported.has(field.fieldKey) && field.isVisible))
    throw new Error('Unsupported checkout form');
  const fields = new Map(form.fields.map((field) => [field.fieldKey, field]));
  return keys.flatMap((key) => {
    const field = fields.get(key);
    if (!field) throw new Error('Incomplete checkout form');
    const required = floor.includes(key) || field.isRequired;
    return field.isVisible || required ? [{ key, required }] : [];
  });
}
export function checkoutFields(
  configuration: readonly CustomerForm[],
  orderType: OrderType,
): CheckoutFields {
  const forms = customerFormsSchema.parse(configuration);
  const type = orderTypeSchema.parse(orderType);
  const floor: readonly ContactField[] = type === 'DineIn' ? ['name', 'email'] : contactFields;
  return {
    contact: fieldsFor(forms, 'checkout_contact', contactFields, floor),
    address:
      type === 'Delivery'
        ? fieldsFor(forms, 'delivery_address', addressFields, ['street', 'postalCode', 'city'])
        : [],
  };
}
