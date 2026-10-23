import { z } from 'zod';
import { tablePaymentCurrency, tablePaymentMinor } from '../domain/tablePaymentMoney';
import { tableShareAmounts } from '../domain/tableShareAmounts';
import { ApiFailure } from '../core/apiFailure';
import type { TablePlanIntent } from './tablePlanIntent';
export const tablePlanMoneySchema = z.strictObject({
  totalMinor: tablePaymentMinor.min(1),
  currency: tablePaymentCurrency,
  roundingIncrementMinor: z.union([z.literal(1), z.literal(5)]),
  sharesMinor: z.array(tablePaymentMinor.min(1)).min(2).max(100),
});
export function requireTablePlanMoney(
  intent: TablePlanIntent,
  money: z.infer<typeof tablePlanMoneySchema>,
) {
  const shares = tableShareAmounts(
    BigInt(money.totalMinor),
    intent.shareCount,
    money.currency,
    intent.customAmountsMinor,
  );
  const equalIncrement = money.currency === 'CHF' || money.currency === 'EUR' ? 5 : 1;
  const increment = intent.customAmountsMinor.length ? 1 : equalIncrement;
  if (
    money.roundingIncrementMinor !== increment ||
    money.sharesMinor.length !== shares.length ||
    money.sharesMinor.some((amount, index) => BigInt(amount) !== shares[index])
  )
    throw new ApiFailure(200, 'contract');
}
