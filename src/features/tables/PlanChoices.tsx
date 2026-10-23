import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TablePaymentAccount } from '../../api/tablePaymentAccountContract';
import { tablePlanSelection, type TablePlanChoice } from '../../domain/tablePlanSelection';
import { contributionInputMinor } from '../../domain/tableContributionInput';
import Field from '../../ui/Field';
import QuantityStepper from '../../ui/QuantityStepper';
import Button from '../../ui/Button';
import Feedback from '../../ui/Feedback';
export default function PlanChoices({
  snapshot,
  busy,
  onReview,
}: Readonly<{
  snapshot: TablePaymentAccount;
  busy: boolean;
  onReview: (choice: TablePlanChoice) => void;
}>) {
  const { t, i18n } = useTranslation();
  const maximum = Math.min(100, snapshot.account.limits.maximumEqualShares);
  const [count, setCount] = useState(Math.min(3, maximum));
  const [custom, setCustom] = useState(false);
  const [amounts, setAmounts] = useState<string[]>([]);
  const [replace, setReplace] = useState(false);
  const previous = snapshot.account.activeEqualSharePlan;
  const choice: TablePlanChoice = {
    shareCount: count,
    customAmountsMinor: custom
      ? Array.from({ length: count }, (_, i) => contributionInputMinor(amounts[i] ?? '') ?? 0)
      : [],
    supersedesPlanId: replace && previous ? previous.planId : null,
  };
  let valid = false;
  try {
    tablePlanSelection(snapshot, snapshot.tenantId, choice);
    valid = true;
  } catch {
    /* Keep current input review-only. */
  }
  if (maximum < 2 || (previous && !previous.isOwnPlan))
    return <Feedback message={t('tablePlanUnavailable')} />;
  return (
    <>
      <Button
        label={t('tablePlanEqual')}
        secondary={custom}
        disabled={busy}
        onPress={() => setCustom(false)}
      />
      <Button
        label={t('tablePlanCustom')}
        secondary={!custom}
        disabled={busy}
        onPress={() => setCustom(true)}
      />
      <QuantityStepper
        label={t('tablePlanGuests')}
        value={count}
        minimum={2}
        maximum={maximum}
        disabled={busy}
        onChange={(value) => {
          setCount(value);
          setAmounts((old) => old.slice(0, value));
        }}
      />
      {custom
        ? Array.from({ length: count }, (_, i) => (
            <Field
              key={i}
              label={t('tablePlanGuestAmount', {
                position: new Intl.NumberFormat(i18n.language).format(i + 1),
              })}
              value={amounts[i] ?? ''}
              editable={!busy}
              keyboardType="decimal-pad"
              onChangeText={(value) =>
                setAmounts((old) =>
                  Array.from({ length: count }, (_, index) =>
                    index === i ? value : (old[index] ?? ''),
                  ),
                )
              }
            />
          ))
        : null}
      {previous ? (
        <>
          <Feedback message={t('tablePlanReplaceHint')} />
          <Button
            label={t('tablePlanReplace')}
            secondary={!replace}
            disabled={busy}
            onPress={() => setReplace((old) => !old)}
          />
        </>
      ) : null}
      {!valid ? <Feedback message={t('tablePlanInvalid')} /> : null}
      <Button
        label={t('tablePlanReview')}
        disabled={busy || !valid}
        onPress={() => {
          if (valid) onReview(choice);
        }}
      />
    </>
  );
}
