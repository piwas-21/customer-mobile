import { useRef, useState } from 'react';
import { Keyboard } from 'react-native';
import type { BasketItemMutation } from '../../api/basketItemMutation';
import { basketItemMutationSchema } from '../../api/basketItemMutation';
import useMounted from '../../core/useMounted';
import { quantityIsValid } from '../../domain/customization';
import type { BasketSelection } from './useBasketSelection';
export type BasketItemEditProps = Readonly<{
  selection: BasketSelection;
  changed: boolean;
  ready: boolean;
  mutate: (input: BasketItemMutation) => Promise<void>;
  onClose: () => void;
}>;
export default function useBasketItemEdit({
  selection,
  changed,
  ready,
  mutate,
  onClose,
}: BasketItemEditProps) {
  const mounted = useMounted();
  const active = useRef(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [quantity, setQuantity] = useState(selection.quantity);
  const [notes, setNotes] = useState(selection.instructions ?? '');
  const editable = !busy && ready && !changed;
  const valid = quantityIsValid(quantity) && notes.length <= 500;
  async function submit(action: 'Update' | 'Remove') {
    if (active.current || !editable || (action === 'Update' && !valid)) return;
    const instructions = notes === (selection.instructions ?? '') ? selection.instructions : notes;
    const payload =
      action === 'Remove'
        ? { ...selection.revision, action }
        : { ...selection.revision, action, quantity, specialInstructions: instructions };
    const parsed = basketItemMutationSchema.safeParse(payload);
    if (!parsed.success) return;
    active.current = true;
    setBusy(true);
    setFailed(false);
    Keyboard.dismiss();
    try {
      await mutate(parsed.data);
      if (mounted.current) onClose();
    } catch {
      if (mounted.current) setFailed(true);
    } finally {
      active.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return {
    quantity,
    setQuantity,
    notes,
    setNotes,
    removing,
    setRemoving,
    busy,
    failed,
    editable,
    valid,
    close: () => {
      if (!active.current) onClose();
    },
    save: () => submit('Update'),
    remove: () => submit('Remove'),
  };
}
