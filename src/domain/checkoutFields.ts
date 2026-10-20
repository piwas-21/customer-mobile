import { customerFieldsFor, type CustomerField } from './customerFormFields';
import { customerFormsSchema, type CustomerForm } from '../api/customerForms';
import { orderTypeSchema, type OrderType } from '../api/orderType';
const contactFields = ['name', 'email', 'phone'] as const;
const addressFields = ['street', 'postalCode', 'city', 'country', 'additionalInfo'] as const;
export type ContactField = (typeof contactFields)[number];
export type AddressField = (typeof addressFields)[number];
export type CheckoutField<Key extends string> = CustomerField<Key>;
export type CheckoutFields = Readonly<{
  contact: readonly CheckoutField<ContactField>[];
  address: readonly CheckoutField<AddressField>[];
}>;
export function checkoutFields(
  configuration: readonly CustomerForm[],
  orderType: OrderType,
): CheckoutFields {
  const forms = customerFormsSchema.parse(configuration);
  const type = orderTypeSchema.parse(orderType);
  const floor: readonly ContactField[] = type === 'DineIn' ? ['name', 'email'] : contactFields;
  return {
    contact: customerFieldsFor(forms, 'checkout_contact', contactFields, floor, 'checkout'),
    address:
      type === 'Delivery'
        ? customerFieldsFor(
            forms,
            'delivery_address',
            addressFields,
            ['street', 'postalCode', 'city'],
            'checkout',
          )
        : [],
  };
}
