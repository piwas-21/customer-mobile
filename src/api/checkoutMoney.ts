import { z } from 'zod';
// Native checkout persists monetary columns as decimal(10, 2).
export const MAX_CHECKOUT_MONEY = 99_999_999.99;
export const checkoutAmount = z
  .number()
  .min(-MAX_CHECKOUT_MONEY)
  .max(MAX_CHECKOUT_MONEY)
  .refine((amount) => {
    const cents = amount * 100;
    return Math.abs(cents - Math.round(cents)) <= Number.EPSILON * Math.max(1, Math.abs(cents)) * 4;
  });
export const checkoutMoney = checkoutAmount.refine((amount) => amount >= 0);
export const checkoutMoneySchema = z.object({
  subTotal: checkoutMoney,
  tax: checkoutMoney,
  deliveryFee: checkoutMoney,
  discount: checkoutMoney,
  // The current discount rule may produce a fractional cent before courtesy rounding.
  customerDiscount: z.number().nonnegative().max(MAX_CHECKOUT_MONEY),
  pointsDiscount: checkoutMoney,
  pointsRedeemed: z.int32().nonnegative(),
  tip: checkoutMoney,
  total: checkoutMoney,
});
