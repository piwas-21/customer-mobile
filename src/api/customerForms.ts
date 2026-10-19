import { z } from 'zod';
import type { CustomerTransport } from '../core/transport';
import type { TenantContext } from '../core/tenantContext';
const MAX_CUSTOMER_FORMS = 32;
const MAX_FORM_FIELDS = 32;
const configurationKey = z.string().min(1).max(100);
const field = z
  .object({
    fieldKey: configurationKey,
    isVisible: z.boolean(),
    isRequired: z.boolean(),
    isLocked: z.boolean(),
    displayOrder: z.int32(),
  })
  .refine(
    (value) =>
      (!value.isRequired || value.isVisible) &&
      (!value.isLocked || (value.isVisible && value.isRequired)),
  );
export const customerFormsSchema = z
  .array(
    z.object({
      formKey: configurationKey,
      fields: z
        .array(field)
        .max(MAX_FORM_FIELDS)
        .refine((fields) => new Set(fields.map((item) => item.fieldKey)).size === fields.length),
    }),
  )
  .max(MAX_CUSTOMER_FORMS)
  .refine((forms) => new Set(forms.map((item) => item.formKey)).size === forms.length);
export type CustomerForm = z.infer<typeof customerFormsSchema>[number];
export function readCustomerForms(client: CustomerTransport, context: TenantContext) {
  return client.request(context, '/api/FormFieldConfiguration', customerFormsSchema);
}
