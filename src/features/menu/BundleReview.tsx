import { useTranslation } from 'react-i18next';
import type { BundleDraft } from './useBundleDraft';
import { selectionReviewRows } from './selectionReview';
import Field from '../../ui/Field';
import ReviewList from './ReviewList';
type Row = Readonly<{ id: string; label: string; component?: string }>;
export default function BundleReview({
  draft,
  disabled,
}: Readonly<{ draft: BundleDraft; disabled: boolean }>) {
  const { t } = useTranslation();
  const { plan, selection, change } = draft;
  if (!plan || !selection) return null;
  const rows: Row[] = [];
  for (const group of plan.groups)
    for (const option of group.options) {
      const quantity = selection.sections[group.id]?.[option.id] ?? 0;
      const component = selection.components[option.id];
      if (quantity <= 0 || !component) continue;
      const name = `${group.label} · ${option.label}`;
      rows.push(
        { id: `component:${option.id}`, label: t('bundlePortions', { name, quantity }) },
        ...selectionReviewRows(plan.component(option.id), component, t).map((row) => ({
          ...row,
          id: `${option.id}:${row.id}`,
        })),
        { id: `notes:${option.id}`, label: t('componentNotes', { name }), component: option.id },
      );
    }
  return (
    <ReviewList
      rows={rows}
      title={t('reviewBundle')}
      quantity={selection.quantity}
      instructions={selection.instructions}
      disabled={disabled}
      change={(instructions) => change({ instructions })}
      renderRow={(item) => {
        const rowId = item.component;
        if (!rowId) return undefined;
        return (
          <Field
            label={item.label}
            value={selection.components[rowId]?.instructions ?? ''}
            multiline
            maxLength={500}
            editable={!disabled}
            onChangeText={(instructions) => {
              const component = selection.components[rowId];
              if (component)
                change({
                  components: { ...selection.components, [rowId]: { ...component, instructions } },
                });
            }}
          />
        );
      }}
    />
  );
}
