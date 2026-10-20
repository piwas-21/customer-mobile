import { z } from 'zod';
import { customerFormsSchema, type CustomerForm } from '../api/customerForms';
import { reservationBookingInputSchema } from '../api/reservationCreateContract';
import { customerFieldsFor } from './customerFormFields';
export const reservationContactKeys = [
  'customerName',
  'customerEmail',
  'customerPhone',
  'specialRequests',
] as const;
export type ReservationContactKey = (typeof reservationContactKeys)[number];
export type ReservationContactDraft = Record<ReservationContactKey, string>;
const contactSchema = z.strictObject({
  customerName: reservationBookingInputSchema.shape.customerName,
  customerEmail: reservationBookingInputSchema.shape.customerEmail,
  customerPhone: reservationBookingInputSchema.shape.customerPhone,
  specialRequests: reservationBookingInputSchema.shape.specialRequests,
});
export function reservationContactFields(configuration: readonly CustomerForm[]) {
  return customerFieldsFor(
    customerFormsSchema.parse(configuration),
    'reservation',
    reservationContactKeys,
    ['customerName', 'customerEmail'],
    'reservation',
  );
}
export function parseReservationContact(
  draft: ReservationContactDraft,
  fields: ReturnType<typeof reservationContactFields>,
) {
  const visible = new Set(fields.map((field) => field.key));
  const contact = {
    customerName: draft.customerName.trim(),
    customerEmail: draft.customerEmail.trim(),
    customerPhone: visible.has('customerPhone') ? draft.customerPhone.trim() || null : null,
    specialRequests: visible.has('specialRequests') ? draft.specialRequests.trim() || null : null,
  };
  const result = contactSchema.safeParse(contact);
  const invalid = new Set<ReservationContactKey>();
  if (!result.success) {
    for (const issue of result.error.issues) {
      const key = reservationContactKeys.find((key) => key === issue.path[0]);
      if (key) invalid.add(key);
    }
  }
  for (const field of fields) if (field.required && !contact[field.key]) invalid.add(field.key);
  return { contact: result.success && invalid.size === 0 ? result.data : null, invalid };
}
