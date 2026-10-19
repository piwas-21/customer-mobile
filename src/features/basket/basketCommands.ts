import type { BasketAddInput } from '../../api/basketRequest';
import type { BasketItemMutation } from '../../api/basketItemMutation';
import type { BasketWorkspace } from '../../core/basketWorkspace';
export type BasketCommand =
  | { kind: 'add'; input: BasketAddInput }
  | { kind: 'mutate'; input: BasketItemMutation }
  | { kind: 'recover' }
  | { kind: 'cancel' };
export async function runBasketCommand(
  workspace: BasketWorkspace,
  command: BasketCommand,
  locale: string,
) {
  switch (command.kind) {
    case 'cancel':
      return workspace.cancel(locale);
    case 'add':
      return { basket: await workspace.add(command.input, locale), outcome: null };
    case 'mutate':
      return { basket: await workspace.mutate(command.input, locale), outcome: null };
    case 'recover':
      return { basket: await workspace.recover(locale), outcome: null };
  }
}
