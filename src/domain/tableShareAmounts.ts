import { ApiFailure } from '../core/apiFailure';
export function tableShareAmounts(
  total: bigint,
  count: number,
  currency: string,
  custom: readonly number[],
) {
  if (
    total <= 0n ||
    !Number.isSafeInteger(count) ||
    count < 2 ||
    count > 1_000 ||
    (custom.length !== 0 && custom.length !== count)
  )
    throw new ApiFailure(200, 'contract');
  const step = currency === 'CHF' || currency === 'EUR' ? 5n : 1n;
  const slots = BigInt(count);
  const base = (total / slots / step) * step;
  const amounts = custom.length
    ? custom.map((amount) => {
        if (!Number.isSafeInteger(amount) || amount <= 0) throw new ApiFailure(200, 'contract');
        return BigInt(amount);
      })
    : Array.from({ length: count }, (_, index) =>
        step > 1n
          ? index === count - 1
            ? total - base * (slots - 1n)
            : base
          : total / slots + (BigInt(index) < total % slots ? 1n : 0n),
      );
  if (
    amounts.some((amount) => amount <= 0n) ||
    amounts.reduce((sum, amount) => sum + amount, 0n) !== total
  )
    throw new ApiFailure(200, 'contract');
  return amounts;
}
