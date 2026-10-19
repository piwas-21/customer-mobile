import type { VariationChoices } from '../domain/variationChoices';
import {
  variationGroup,
  variationSelection,
  selectedVariation,
} from '../domain/variationSelection';
import ChoiceGroup from './ChoiceGroup';
export default function VariationPicker({
  choices,
  value,
  label,
  disabled = false,
  onChange,
}: Readonly<{
  choices: VariationChoices;
  value: string | null;
  label: string;
  disabled?: boolean;
  onChange: (value: string | null) => void;
}>) {
  const group = variationGroup(choices, label);
  return (
    <ChoiceGroup
      group={group}
      selection={variationSelection(value)}
      disabled={disabled}
      onChange={(selection) => {
        const selected = selectedVariation(selection);
        if (selected !== undefined) onChange(selected);
      }}
    />
  );
}
