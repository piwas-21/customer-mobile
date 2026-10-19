import type { ChoiceGroup, Selection } from './customization';
import { changeChoice } from './customization';
export function toggleChoice(group: ChoiceGroup, selection: Selection, id: string): Selection {
  const option = group.options.find((row) => row.id === id);
  if (!option?.available) return selection;
  const current = selection[id] ?? 0;
  if (current > 0) {
    if ((option.minimumQuantity ?? 0) > 0 || (group.min === 1 && group.max === 1)) return selection;
    return changeChoice(group, selection, id, -current);
  }
  const next =
    group.max === 1 ? Object.fromEntries(Object.keys(selection).map((key) => [key, 0])) : selection;
  const changed = changeChoice(group, next, id, 1);
  return changed === next ? selection : changed;
}
