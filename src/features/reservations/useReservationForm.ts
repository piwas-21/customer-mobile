import { useRef, useState } from 'react';
import { Keyboard } from 'react-native';
import {
  parseReservationContact,
  type ReservationContactDraft,
  type ReservationContactKey,
} from '../../domain/reservationContact';
import type { AvailabilityInput } from '../../api/reservationAvailability';
import useMounted from '../../core/useMounted';
import { useReservation } from './ReservationProvider';
import useReservationFields from './useReservationFields';
export type ReservationSelection = Readonly<
  AvailabilityInput & { timeZone: string; startTime: string; endTime: string }
>;
export default function useReservationForm(selection: ReservationSelection) {
  const operations = useReservation();
  const fields = useReservationFields();
  const mounted = useMounted();
  const pending = useRef(false);
  const [draft, setDraft] = useState<ReservationContactDraft>({
    customerName: '',
    customerEmail: '',
    customerPhone: '',
    specialRequests: '',
  });
  const [invalid, setInvalid] = useState<ReadonlySet<ReservationContactKey>>(new Set());
  const [failed, setFailed] = useState(false);
  const change = (key: ReservationContactKey, value: string) => {
    setDraft((previous) => ({ ...previous, [key]: value }));
    setInvalid((previous) => new Set([...previous].filter((name) => name !== key)));
    setFailed(false);
  };
  async function submit() {
    if (
      !mounted.current ||
      pending.current ||
      !fields.fields ||
      !operations?.controller ||
      operations.busy ||
      operations.loading ||
      operations.value !== null
    )
      return;
    const parsed = parseReservationContact(draft, fields.fields);
    setInvalid(parsed.invalid);
    if (!parsed.contact) return;
    pending.current = true;
    Keyboard.dismiss();
    setFailed(false);
    try {
      await operations.create({ ...selection, ...parsed.contact });
    } catch {
      if (mounted.current) setFailed(true);
    } finally {
      pending.current = false;
    }
  }
  return { fields, draft, invalid, failed, busy: operations?.busy === true, change, submit };
}
