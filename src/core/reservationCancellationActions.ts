import type { ReservationItem } from '../api/reservations';
import { reservationItemSchema } from '../api/reservations';
import { prepareReservationCancellation } from '../api/reservationCancellation';
import {
  reservationCancellationPreparationSchema,
  type ReservationCancellationPreparation,
} from './reservationCancellationPreparation';
import { canonicalUuidSchema } from './identifiers';
import { OwnedReservationReview } from './ownedReservationReview';
import type { SingleOperation } from './singleOperation';
import type { ReservationAttemptView } from './reservationAttemptView';
import type { ReservationOperationScope } from './reservationOperationScope';
export type ReservationCancellationReview = Readonly<{
  operationId: string;
  reservation: ReservationItem;
  timeZone: string;
}>;
type Candidate = {
  operationId: string;
  timeZone: string;
  preparation: ReservationCancellationPreparation;
  response: Awaited<ReturnType<typeof prepareReservationCancellation>>;
};
export class ReservationCancellationActions extends OwnedReservationReview<
  string,
  Candidate,
  ReservationCancellationReview
> {
  constructor(
    scope: ReservationOperationScope,
    mutations: SingleOperation<ReservationAttemptView | null>,
    createId: () => string,
  ) {
    super(scope, mutations, {
      capture: (id) => canonicalUuidSchema.parse(id),
      zone: () => scope.configuration.timezone,
      prepare: async (reservationId, guard, locale) => {
        const preparation = reservationCancellationPreparationSchema.parse({
          environment: scope.context.environment,
          tenantId: scope.context.tenant.id,
          principal: scope.owner.principal,
          sessionId: createId(),
          request: {
            schemaVersion: 1,
            operationId: createId(),
            tenantId: scope.context.tenant.id,
            reservationId,
            timeZone: scope.configuration.timezone,
          },
        });
        const response = await prepareReservationCancellation(
          scope.client,
          scope.context,
          preparation,
          guard,
          locale,
        );
        return {
          operationId: preparation.request.operationId,
          timeZone: response.timeZone,
          preparation,
          response,
        };
      },
      snapshot: (candidate) => ({
        operationId: candidate.operationId,
        reservation: reservationItemSchema.parse(candidate.response.reservation),
        timeZone: candidate.timeZone,
      }),
      install: (candidate) =>
        scope.repository.reservations.installCancellation(
          scope.context,
          candidate.preparation,
          candidate.response,
          scope.assertCurrent,
        ),
    });
  }
}
