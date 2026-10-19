import { receiptFormatters, orderStatusKey } from './orderPresentation';
import { receiptResponse } from '../../test/orderReceipt';
import { receiptRows } from './receiptRows';
it('uses the frozen receipt currency and restaurant timezone independently of the device', () => {
  const f = { ...receiptResponse(), businessTimeZoneId: 'Pacific/Honolulu' };
  const display = receiptFormatters(f, 'en-US');
  expect(display.price(17)).toContain('CHF');
  expect(display.date('2026-10-19T00:15:00Z')).toMatch(/Oct 18, 2026.*2:15 PM/);
});
it('keeps fulfillment and settlement separate and gives unknown states a neutral fallback', () => {
  expect(orderStatusKey('Completed', false)).toBe('receiptStatus.Completed');
  expect(orderStatusKey('Completed', true)).toBe('receiptPayment.Completed');
  expect(orderStatusKey('PendingApproval', true)).toBe('receiptStatusUnknown');
  expect(orderStatusKey('NewUnknown', false)).toBe('receiptStatusUnknown');
});
it('keeps frozen names, components, removed ingredients and notes without editable basket IDs', () => {
  const root = receiptResponse().items[0]!;
  const rows = receiptRows([
    {
      ...root,
      name: 'Historical dish',
      presentationLabel: 'Meal',
      specialInstructions: 'Cut in half',
      ingredients: [
        {
          ingredientId: root.productId!,
          name: 'Onion',
          quantity: 1,
          isRemoved: true,
          isAddOn: false,
        },
        {
          ingredientId: root.productId!,
          name: 'Tomato',
          quantity: 2,
          isRemoved: false,
          isAddOn: true,
        },
      ],
      children: [{ ...root, name: 'Drink', children: [] }],
    },
  ]);
  expect(rows[0]).toMatchObject({
    name: 'Meal · Historical dish',
    itemId: null,
    instructions: 'Cut in half',
    removed: ['Onion'],
  });
  expect(rows[0]!.description).toContain('2 × Tomato');
  expect(rows[1]).toMatchObject({ itemId: null, amount: null, nested: true });
});
