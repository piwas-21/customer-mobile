import { useTranslation } from 'react-i18next';
import type { ItemFlowStep } from '../../domain/itemFlow';
import type { CatalogueChoiceGroup } from '../../domain/catalogueChoices';
import type { ItemSelections } from '../../domain/selectionComposition';
import VariationPicker from '../../ui/VariationPicker';
import ProductChoiceStep from './ProductChoiceStep';
import ProductSideStep from './ProductSideStep';
export default function ItemChoiceStep({
  step,
  heading,
  groups,
  selection,
  disabled,
  change,
}: Readonly<{
  heading?: string | undefined;
  step: ItemFlowStep;
  groups: readonly CatalogueChoiceGroup[];
  selection: ItemSelections;
  disabled: boolean;
  change: (patch: Partial<ItemSelections>) => void;
}>) {
  const { t } = useTranslation();
  switch (step.kind) {
    case 'variation':
      return (
        <VariationPicker
          choices={step.choices}
          value={selection.variationId}
          label={[heading, step.label ?? t('dishSize')].filter(Boolean).join(' · ')}
          disabled={disabled}
          onChange={(variationId) => change({ variationId })}
        />
      );
    case 'groups':
      return (
        <ProductChoiceStep
          heading={heading}
          choices={step.choices}
          groups={groups}
          selection={selection.groups}
          disabled={disabled}
          onChange={(id, value) => change({ groups: { ...selection.groups, [id]: value } })}
        />
      );
    case 'sides':
      return (
        <ProductSideStep
          heading={heading}
          choices={step.choices}
          selection={selection.sides}
          disabled={disabled}
          onChange={(id, value) => {
            const sides = { ...selection.sides };
            if (value) sides[id] = value;
            else delete sides[id];
            change({ sides });
          }}
        />
      );
  }
}
