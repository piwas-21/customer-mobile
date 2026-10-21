import {
  readReservationEditContext,
  readReservationEditAvailability,
} from '../api/reservationEditReads';
import type { AvailabilityInput } from '../api/reservationAvailability';
import {
  reservationEditBookingInputSchema,
  type ReservationEditBookingInput,
} from '../api/reservationEditContract';
import { prepareReservationEdit } from '../api/reservationEdit';
import {
  reservationEditPreparationSchema,
  type ReservationEditPreparation,
} from './reservationEditPreparation';
import { reservationItemSchema, type ReservationItem } from '../api/reservations';
import { canonicalUuidSchema } from './identifiers';
import { OwnedReservationReview } from './ownedReservationReview';
import type { SingleOperation } from './singleOperation';
import type { ReservationAttemptView } from './reservationAttemptView';
import type { ReservationOperationScope } from './reservationOperationScope';
export type ReservationEditReview = Readonly<{
  operationId: string;
  original: ReservationItem;
  proposed: ReservationItem;
  timeZone: string;
}>;
type Candidate = {
  operationId: string;
  timeZone: string;
  preparation: ReservationEditPreparation;
  response: Awaited<ReturnType<typeof prepareReservationEdit>>;
};
export class ReservationEditActions extends OwnedReservationReview<
  ReservationEditBookingInput,
  Candidate,
  ReservationEditReview
> {
  constructor(
    scope: ReservationOperationScope,
    mutations: SingleOperation<ReservationAttemptView | null>,
    createId: () => string,
  ) {
    super(scope, mutations, {
      capture: (input) => reservationEditBookingInputSchema.parse(input),
      zone: (input) => input.timeZone,
      prepare: async (input, guard, locale) => {
        const preparation = reservationEditPreparationSchema.parse({
          environment: scope.context.environment,
          tenantId: scope.context.tenant.id,
          principal: scope.owner.principal,
          sessionId: createId(),
          draft: {
            ...input,
            schemaVersion: 1,
            operationId: createId(),
            tenantId: scope.context.tenant.id,
          },
        });
        const response = await prepareReservationEdit(
          scope.client,
          scope.context,
          preparation,
          guard,
          locale,
        );
        return {
          operationId: preparation.draft.operationId,
          timeZone: response.timeZone,
          preparation,
          response,
        };
      },
      snapshot: (candidate) => ({
        operationId: candidate.operationId,
        original: reservationItemSchema.parse(candidate.response.original),
        proposed: reservationItemSchema.parse(candidate.response.proposed),
        timeZone: candidate.timeZone,
      }),
      install: (candidate) =>
        scope.repository.reservations.installEdit(
          scope.context,
          candidate.preparation,
          candidate.response,
          scope.assertCurrent,
        ),
    });
  }
  private readScope(reservationId: string) {
    this.assertStart();
    return {
      tenantId: this.scope.context.tenant.id,
      reservationId: canonicalUuidSchema.parse(reservationId),
      timeZone: this.scope.configuration.timezone,
    };
  }
  async context(reservationId: string) {
    const scope = this.readScope(reservationId);
    await this.scope.fresh(scope.timeZone);
    this.assertStart();
    const result = await readReservationEditContext(
      this.scope.sessions,
      this.scope.owner.principal.id,
      scope,
    );
    this.assertStart();
    return result;
  }
  async availability(reservationId: string, input: AvailabilityInput) {
    const scope = this.readScope(reservationId);
    await this.scope.fresh(scope.timeZone);
    this.assertStart();
    const result = await readReservationEditAvailability(
      this.scope.sessions,
      this.scope.owner.principal.id,
      scope,
      input,
    );
    this.assertStart();
    return result;
  }
}
