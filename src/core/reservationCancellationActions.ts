import type { ReservationItem } from '../api/reservations';
import { reservationItemSchema } from '../api/reservations';
import { prepareReservationCancellation } from '../api/reservationCancellation';
import {
  reservationCancellationPreparationSchema,
  type ReservationCancellationPreparation,
} from './reservationCancellationPreparation';
import { canonicalUuidSchema } from './identifiers';
import { SingleOperation } from './singleOperation';
import type { ReservationAttemptView } from './reservationAttemptView';
import type { ReservationOperationScope } from './reservationOperationScope';
import { ApiFailure } from './apiFailure';
export type ReservationCancellationReview = Readonly<{
  operationId: string;
  reservation: ReservationItem;
  timeZone: string;
}>;
type Candidate = {
  preparation: ReservationCancellationPreparation;
  response: Awaited<ReturnType<typeof prepareReservationCancellation>>;
};
export class ReservationCancellationActions {
  private candidate: Candidate | undefined;
  private revision = 0;
  private readonly preparation = new SingleOperation<ReservationCancellationReview>();
  constructor(
    private readonly scope: ReservationOperationScope,
    private readonly mutations: SingleOperation<ReservationAttemptView | null>,
    private readonly createId: () => string,
  ) {}
  invalidate() {
    this.revision++;
    this.candidate = undefined;
  }
  dismiss(operationId: string) {
    this.scope.assertCurrent();
    if (this.candidate?.preparation.request.operationId === canonicalUuidSchema.parse(operationId))
      this.invalidate();
  }
  prepare(reservationId: string, locale: string) {
    const id = canonicalUuidSchema.parse(reservationId);
    this.assertStart();
    if (this.mutations.busy) throw new ApiFailure(409, 'refused');
    return this.preparation.run('prepare/' + id, async () => {
      this.invalidate();
      const revision = this.revision;
      const guard = () => {
        this.scope.assertCurrent();
        if (revision !== this.revision || this.mutations.busy) throw new ApiFailure(409, 'refused');
      };
      if (await this.scope.load()) throw new ApiFailure(409, 'refused');
      guard();
      await this.scope.fresh(this.scope.configuration.timezone);
      guard();
      const preparation = reservationCancellationPreparationSchema.parse({
        environment: this.scope.context.environment,
        tenantId: this.scope.context.tenant.id,
        principal: this.scope.owner.principal,
        sessionId: this.createId(),
        request: {
          schemaVersion: 1,
          operationId: this.createId(),
          tenantId: this.scope.context.tenant.id,
          reservationId: id,
          timeZone: this.scope.configuration.timezone,
        },
      });
      const response = await prepareReservationCancellation(
        this.scope.client,
        this.scope.context,
        preparation,
        guard,
        locale,
      );
      guard();
      this.assertStart();
      if (await this.scope.load()) throw new ApiFailure(409, 'refused');
      guard();
      this.candidate = { preparation, response };
      return {
        operationId: preparation.request.operationId,
        reservation: reservationItemSchema.parse(response.reservation),
        timeZone: response.timeZone,
      };
    });
  }
  async confirm(operationId: string, locale: string) {
    const id = canonicalUuidSchema.parse(operationId);
    this.assertStart();
    const candidate = this.candidate;
    if (candidate?.preparation.request.operationId !== id) throw new ApiFailure(409, 'refused');
    if (await this.scope.load()) throw new ApiFailure(409, 'refused');
    await this.scope.fresh(candidate.preparation.request.timeZone);
    this.assertStart();
    // Consume the exact local confirmation before durable writes; a lost acknowledgement goes to original recovery.
    if (this.candidate !== candidate) throw new ApiFailure(409, 'refused');
    this.invalidate();
    const record = await this.scope.repository.reservations.installCancellation(
      this.scope.context,
      candidate.preparation,
      candidate.response,
      this.scope.assertCurrent,
    );
    return this.scope.dispatch(record, 'submit', locale);
  }
  private assertStart() {
    this.scope.assertStart();
    if (this.scope.owner.principal.kind !== 'customer') throw new ApiFailure(403, 'refused');
  }
}
