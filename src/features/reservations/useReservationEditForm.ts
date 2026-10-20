import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ReservationEditContext } from '../../api/reservationEditReads';
import {
  reservationEditBookingInputSchema,
  type ReservationEditBookingInput,
} from '../../api/reservationEditContract';
import type { CustomerReservationController } from '../../core/customerReservationController';
import {
  parseReservationContact,
  type ReservationContactDraft,
  type ReservationContactKey,
} from '../../domain/reservationContact';
import useReservationFields from './useReservationFields';
import useReservationReview from './useReservationReview';
import useOwnedReservationTimes from './useOwnedReservationTimes';
import type { ReservationState } from './ReservationProvider';
const actions = {
  prepare: (
    controller: CustomerReservationController,
    input: ReservationEditBookingInput | null,
    locale: string,
  ) => {
    if (!input) throw new Error('Review the current booking input first');
    return controller.prepareEdit(input, locale);
  },
  dismiss: (controller: CustomerReservationController, id: string) => controller.dismissEdit(id),
  confirm: (operations: ReservationState, id: string) => operations.confirmEdit(id),
};
export default function useReservationEditForm(
  data: ReservationEditContext,
  controller: CustomerReservationController,
) {
  const { i18n } = useTranslation();
  const configured = useReservationFields();
  const original = data.reservation;
  const [draft, setDraft] = useState<ReservationContactDraft>({
    ...data.contact,
    customerPhone: data.contact.customerPhone ?? '',
    specialRequests: original.specialRequests ?? '',
  });
  const [date, setDate] = useState(original.reservationDate);
  const [party, setParty] = useState(original.numberOfGuests);
  const [selected, setSelected] = useState<
    | {
        date: string;
        numberOfGuests: number;
        startTime: string;
        endTime: string;
      }
    | undefined
  >({
    date: original.reservationDate,
    numberOfGuests: original.numberOfGuests,
    startTime: original.startTime,
    endTime: original.endTime,
  });
  const [invalid, setInvalid] = useState<ReadonlySet<ReservationContactKey>>(new Set());
  const fields = configured.fields?.slice();
  if (fields) {
    for (const key of ['customerPhone', 'specialRequests'] as const) {
      const existing =
        key === 'customerPhone' ? data.contact.customerPhone : original.specialRequests;
      if (existing && !fields.some((field) => field.key === key))
        fields.push({ key, required: false });
    }
  }
  const selection = selected?.date === date && selected.numberOfGuests === party ? selected : null;
  const parsed = fields ? parseReservationContact(draft, fields) : null;
  const wire = JSON.stringify(
    selection && parsed?.contact
      ? {
          ...selection,
          ...parsed.contact,
          reservationId: original.reservationId,
          timeZone: data.timeZone,
        }
      : null,
  );
  const input = useMemo(() => {
    const value: unknown = JSON.parse(wire);
    const parsed = reservationEditBookingInputSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
  }, [wire]);
  const unsupportedSelection = Boolean(selection && parsed?.contact && !input);
  const review = useReservationReview(input, actions);
  const times = useOwnedReservationTimes(controller, original.reservationId, {
    date,
    numberOfGuests: party,
  });
  const change = (key: ReservationContactKey, value: string) => {
    setDraft((previous) => ({ ...previous, [key]: value }));
    setInvalid((previous) => new Set([...previous].filter((name) => name !== key)));
  };
  async function prepare() {
    setInvalid(parsed?.invalid ?? new Set());
    if (input) await review.prepare();
  }
  function choose(startTime: string, endTime: string) {
    setSelected({ date, numberOfGuests: party, startTime, endTime });
  }
  function checkTimes() {
    setSelected(undefined);
    void times.read();
  }
  return {
    fields,
    input,
    configured,
    draft,
    invalid,
    change,
    date,
    setDate,
    party,
    setParty,
    selection,
    choose,
    times,
    checkTimes,
    review,
    prepare,
    locale: i18n.language,
    unsupportedSelection,
    canReview: Boolean(selection && fields && !unsupportedSelection),
    busy: review.busy || times.loading,
  };
}
