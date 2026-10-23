import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TablePaymentAccount } from '../../api/tablePaymentAccountContract';
import type { TableAccount } from '../../api/tableAccountContract';
import type { TablePaymentIntent } from '../../api/tablePaymentIntent';
import { contributionUnitPage, contributionUnitKey } from '../../domain/tableContributionInput';
import { formatTablePaymentMinor } from '../../domain/tablePaymentMoney';
import Button from '../../ui/Button';
type Unit = TablePaymentIntent['selectedUnits'][number];
export default function ContributionUnitChoices({
  account,
  bill,
  selected,
  onChange,
  disabled,
}: Readonly<{
  account: TablePaymentAccount['account'];
  bill: TableAccount;
  selected: Unit[];
  onChange: (units: Unit[]) => void;
  disabled: boolean;
}>) {
  const [page, setPage] = useState(0);
  const { t, i18n } = useTranslation();
  const result = contributionUnitPage(account, page);
  const keys = new Set(selected.map(contributionUnitKey));
  const displayed = result.units.map((unit) => {
    const line = bill.items.find(
      (line) => line.orderId === unit.orderId && line.item.itemId === unit.orderItemId,
    );
    return { unit, line };
  });
  return (
    <>
      {displayed.map(({ unit, line }) => {
        if (!line) return null;
        const chosen = keys.has(contributionUnitKey(unit));
        return (
          <Button
            key={contributionUnitKey(unit)}
            secondary={!chosen}
            label={t(chosen ? 'tableContributionSelected' : 'tableContributionSelectUnit', {
              name: line.item.productName,
              position: new Intl.NumberFormat(i18n.language).format(unit.ordinal),
              amount: formatTablePaymentMinor(unit.amountMinor, account.currency, i18n.language),
            })}
            disabled={
              disabled || (!chosen && selected.length >= account.limits.maximumSelectedUnits)
            }
            onPress={() =>
              onChange(
                chosen
                  ? selected.filter(
                      (value) => contributionUnitKey(value) !== contributionUnitKey(unit),
                    )
                  : [
                      ...selected,
                      {
                        orderId: unit.orderId,
                        orderItemId: unit.orderItemId,
                        ordinal: unit.ordinal,
                      },
                    ],
              )
            }
          />
        );
      })}
      {result.previous ? (
        <Button
          secondary
          label={t('tableContributionPrevious')}
          disabled={disabled}
          onPress={() => setPage(page - 1)}
        />
      ) : null}
      {result.next ? (
        <Button
          secondary
          label={t('tableContributionNext')}
          disabled={disabled}
          onPress={() => setPage(page + 1)}
        />
      ) : null}
    </>
  );
}
