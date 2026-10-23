import { tableRoundFixture, roundGuard } from './tableRoundRepository';
import { contributionIntent, preparedContribution } from './tablePayment';
import { tablePaymentPreparationSchema } from '../core/tablePaymentPreparation';
export async function tableContributionFixture(customer = false) {
  const f = await tableRoundFixture(customer);
  const preparation = tablePaymentPreparationSchema.parse({
    ...f.review.preparation,
    intent: contributionIntent(),
    currency: 'CHF',
  });
  const prepared = preparedContribution();
  const install = () =>
    f.repository.tablePayments.install(f.context, preparation, prepared, roundGuard);
  return { ...f, roundPrepared: f.prepared, preparation, prepared, install };
}
