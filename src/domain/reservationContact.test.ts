import {
  reservationContactFields,
  parseReservationContact,
  reservationContactKeys,
} from './reservationContact';
import type { CustomerForm } from '../api/customerForms';
function forms(): CustomerForm[] {
  return [
    {
      formKey: 'reservation',
      fields: reservationContactKeys.map((fieldKey, displayOrder) => ({
        fieldKey,
        displayOrder,
        isVisible: true,
        isRequired: false,
        isLocked: false,
      })),
    },
  ];
}
const draft = {
  customerName: ' Guest ',
  customerEmail: ' guest@example.test ',
  customerPhone: ' ',
  specialRequests: ' ',
};
it('enforces mandatory identity floors, trims contacts and turns empty optional input into null', () => {
  const fields = reservationContactFields(forms());
  expect(fields.slice(0, 2)).toEqual([
    { key: 'customerName', required: true },
    { key: 'customerEmail', required: true },
  ]);
  expect(parseReservationContact(draft, fields)).toEqual({
    contact: {
      customerName: 'Guest',
      customerEmail: 'guest@example.test',
      customerPhone: null,
      specialRequests: null,
    },
    invalid: new Set(),
  });
  expect(
    parseReservationContact({ ...draft, customerName: ' ', customerEmail: 'bad' }, fields).invalid,
  ).toEqual(new Set(['customerName', 'customerEmail']));
});
it('honors required phone and instructions while discarding hidden optional private input', () => {
  const configured = forms();
  configured[0]!.fields[2]!.isVisible = false;
  let fields = reservationContactFields(configured);
  expect(
    parseReservationContact({ ...draft, customerPhone: 'private hidden' }, fields).contact
      ?.customerPhone,
  ).toBeNull();
  configured[0]!.fields[2]!.isVisible = true;
  configured[0]!.fields[2]!.isRequired = true;
  configured[0]!.fields[3]!.isRequired = true;
  fields = reservationContactFields(configured);
  expect(parseReservationContact(draft, fields).invalid).toEqual(
    new Set(['customerPhone', 'specialRequests']),
  );
});
it.each(['missing', 'unknown-visible', 'hidden-required', 'duplicate'] as const)(
  'fails closed on unusable configuration: %s',
  (mode) => {
    const configured = forms();
    if (mode === 'missing') configured[0]!.fields.pop();
    else if (mode === 'unknown-visible')
      configured[0]!.fields.push({ ...configured[0]!.fields[0]!, fieldKey: 'staffOnly' });
    else if (mode === 'hidden-required')
      Object.assign(configured[0]!.fields[3]!, { isVisible: false, isRequired: true });
    else configured[0]!.fields.push(configured[0]!.fields[0]!);
    expect(() => reservationContactFields(configured)).toThrow();
  },
);
it.each([
  ['customerName', 'x'.repeat(101)],
  ['customerEmail', 'x'.repeat(250) + '@test.test'],
  ['customerPhone', '1'.repeat(21)],
  ['specialRequests', 'x'.repeat(1001)],
] as const)('rejects oversized %s before dispatch', (key, value) => {
  const parsed = parseReservationContact(
    { ...draft, [key]: value },
    reservationContactFields(forms()),
  );
  expect(parsed.contact).toBeNull();
  expect(parsed.invalid.has(key)).toBe(true);
});
