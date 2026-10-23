import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TablePaymentAccount } from '../../api/tablePaymentAccountContract';
import type { TableAccount } from '../../api/tableAccountContract';
import {
  tableContributionSelection,
  type TableContributionChoice,
} from '../../domain/tableContributionSelection';
import { contributionInputMinor } from '../../domain/tableContributionInput';
import { formatTablePaymentMinor } from '../../domain/tablePaymentMoney';
import Button from '../../ui/Button';
import Feedback from '../../ui/Feedback';
import Field from '../../ui/Field';
import ContributionUnitChoices from './ContributionUnitChoices';
type Mode = TableContributionChoice['mode'];
export default function ContributionChoices({
  snapshot,
  bill,
  busy,
  onReview,
}: Readonly<{
  snapshot: TablePaymentAccount;
  bill: TableAccount;
  busy: boolean;
  onReview: (choice: TableContributionChoice) => void;
}>) {
  const { t, i18n } = useTranslation();
  const [mode, setMode] = useState<Mode>('Full');
  const [amount, setAmount] = useState('');
  const [units, setUnits] = useState<
    Extract<TableContributionChoice, { mode: 'Items' }>['selectedUnits']
  >([]);
  const [ordinal, setOrdinal] = useState<number>();
  const account = snapshot.account;
  const plan = account.activeEqualSharePlan;
  const modes: Mode[] = ['Full', 'Amount', 'Items'];
  if (plan) modes.push(plan.isCustom ? 'CustomAmount' : 'Equal');
  const choice = currentChoice(mode, amount, units, plan, ordinal);
  let valid = false;
  try {
    if (choice) {
      tableContributionSelection(snapshot, snapshot.tenantId, choice);
      valid = true;
    }
  } catch {
    /* Current amount and available units must pass the same exact review boundary. */
  }
  return (
    <>
      {modes.map((value) => (
        <Button
          key={value}
          secondary={mode !== value}
          label={t('tableContribution' + value)}
          disabled={busy}
          onPress={() => {
            setMode(value);
            setOrdinal(undefined);
          }}
        />
      ))}
      {mode === 'Amount' ? (
        <Field
          label={t('tableContributionAmountLabel')}
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          editable={!busy}
        />
      ) : null}
      {mode === 'Items' ? (
        <ContributionUnitChoices
          account={account}
          bill={bill}
          selected={units}
          onChange={setUnits}
          disabled={busy}
        />
      ) : null}
      {mode === 'Equal' || mode === 'CustomAmount'
        ? plan?.slots.map((slot) => (
            <Button
              key={slot.ordinal}
              secondary={ordinal !== slot.ordinal}
              disabled={busy || !slot.isAvailable}
              label={t('tablePaymentShare', {
                position: new Intl.NumberFormat(i18n.language).format(slot.ordinal),
                amount: formatTablePaymentMinor(slot.amountMinor, account.currency, i18n.language),
                status: t(
                  slot.isAvailable ? 'tablePaymentShareAvailable' : 'tablePaymentShareUnavailable',
                ),
              })}
              onPress={() => setOrdinal(slot.ordinal)}
            />
          ))
        : null}
      {!valid ? <Feedback message={t('tableContributionInvalid')} /> : null}
      <Button
        label={t('tableContributionReview')}
        disabled={busy || !valid}
        onPress={() => {
          if (choice && valid) onReview(choice);
        }}
      />
    </>
  );
}

function currentChoice(
  mode: Mode,
  amount: string,
  units: Extract<TableContributionChoice, { mode: 'Items' }>['selectedUnits'],
  plan: TablePaymentAccount['account']['activeEqualSharePlan'],
  ordinal: number | undefined,
): TableContributionChoice | undefined {
  if (mode === 'Full') return { mode };
  const minor = contributionInputMinor(amount);
  if (mode === 'Amount' && minor) return { mode, amountMinor: minor };
  if (mode === 'Items' && units.length) return { mode, selectedUnits: units };
  if ((mode === 'Equal' || mode === 'CustomAmount') && plan && ordinal)
    return { mode, planId: plan.planId, ordinal };
  return undefined;
}
