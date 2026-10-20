import type { AvailabilityInput } from '../api/reservationAvailability';
import { ReservationEditActions } from './reservationEditActions';
import type { ReservationEditBookingInput } from '../api/reservationEditContract';
import { createReservationPreparation } from './reservationOperationRecord';
import { prepareReservation } from '../api/reservationCreate';
import {
  reservationBookingInputSchema,
  type ReservationBookingInput,
} from '../api/reservationCreateContract';
import type { Bootstrap } from './capabilities';
import { canonicalUuidSchema } from './identifiers';
import type { Principal } from './credentials';
import type { SessionRepository } from './sessionRepository';
import type { SessionController } from './sessionController';
import { SingleOperation } from './singleOperation';
import type { TenantContext } from './tenantContext';
import { ApiFailure, type CustomerTransport } from './transport';
import type { ReservationAttemptView } from './reservationAttemptView';
import { ReservationOperationScope } from './reservationOperationScope';
import { ReservationCancellationActions } from './reservationCancellationActions';
export class CustomerReservationController {
  private readonly scope: ReservationOperationScope;
  private readonly edits: ReservationEditActions;
  private readonly cancellations: ReservationCancellationActions;
  private readonly actions = new SingleOperation<ReservationAttemptView | null>();
  constructor(
    context: TenantContext,
    client: CustomerTransport,
    repository: SessionRepository,
    sessions: SessionController,
    principal: Principal,
    private readonly createId: () => string,
    bootstrap: Bootstrap,
  ) {
    this.scope = new ReservationOperationScope(
      context,
      client,
      repository,
      sessions,
      principal,
      bootstrap,
    );
    this.cancellations = new ReservationCancellationActions(this.scope, this.actions, createId);
    this.edits = new ReservationEditActions(this.scope, this.actions, createId);
  }
  readonly assertCurrent = () => this.scope.assertCurrent();
  dispose() {
    this.invalidateReviews();
    this.scope.owner.dispose();
  }
  async saved() {
    const record = await this.scope.load();
    return record ? this.scope.view(record) : null;
  }
  prepareCancellation(reservationId: string, locale: string) {
    this.edits.invalidate();
    return this.cancellations.prepare(reservationId, locale);
  }
  dismissCancellation(operationId: string) {
    this.cancellations.dismiss(operationId);
  }
  confirmCancellation(operationId: string, locale: string) {
    const id = canonicalUuidSchema.parse(operationId);
    this.assertCurrent();
    return this.actions.run('confirm-cancellation/' + id, () =>
      this.cancellations.confirm(id, locale),
    );
  }
  editContext(reservationId: string) {
    return this.edits.context(reservationId);
  }
  editAvailability(reservationId: string, input: AvailabilityInput) {
    return this.edits.availability(reservationId, input);
  }
  prepareEdit(input: ReservationEditBookingInput, locale: string) {
    this.cancellations.invalidate();
    return this.edits.prepare(input, locale);
  }
  dismissEdit(operationId: string) {
    this.edits.dismiss(operationId);
  }
  confirmEdit(operationId: string, locale: string) {
    const id = canonicalUuidSchema.parse(operationId);
    this.assertCurrent();
    return this.actions.run('confirm-edit/' + id, () => this.edits.confirm(id, locale));
  }
  private invalidateReviews() {
    this.cancellations.invalidate();
    this.edits.invalidate();
  }
  create(input: ReservationBookingInput, locale: string) {
    const captured = reservationBookingInputSchema.parse(input);
    this.scope.assertStart();
    return this.actions.run(JSON.stringify(captured), async () => {
      this.invalidateReviews();
      if (await this.scope.load()) throw new ApiFailure(409, 'refused');
      await this.scope.fresh(captured.timeZone);
      const preparation = createReservationPreparation(
        this.scope.context,
        this.scope.owner.principal,
        captured,
        this.createId,
      );
      const proof = await prepareReservation(
        this.scope.client,
        this.scope.context,
        preparation,
        this.assertCurrent,
        locale,
      );
      this.scope.assertStart();
      const record = await this.scope.repository.reservations.install(
        this.scope.context,
        preparation,
        proof,
        this.assertCurrent,
      );
      return this.scope.dispatch(record, 'create', locale);
    });
  }
  recover(locale: string) {
    this.assertCurrent();
    return this.actions.run('recover', async () => {
      this.invalidateReviews();
      const record = await this.scope.load();
      return record ? this.scope.dispatch(record, 'recover', locale) : null;
    });
  }
  retryOriginal(operationId: string, locale: string) {
    this.scope.assertStart();
    const id = canonicalUuidSchema.parse(operationId);
    return this.actions.run('retry/' + id, async () => {
      this.invalidateReviews();
      const record = await this.scope.load();
      if (
        record?.proof.operationId !== id ||
        record.cancellation ||
        record.cancellationRequested ||
        record.resolution
      )
        throw new ApiFailure(409, 'refused');
      return this.scope.dispatch(record, 'create', locale);
    });
  }
  cancelAttempt(operationId: string, locale: string) {
    this.assertCurrent();
    const id = canonicalUuidSchema.parse(operationId);
    return this.actions.run('cancel/' + id, async () => {
      this.invalidateReviews();
      const record = await this.scope.repository.reservations.requestCancellation(
        this.scope.context,
        this.scope.owner.principal,
        id,
        this.assertCurrent,
      );
      return this.scope.dispatch(record, 'cancel-attempt', locale);
    });
  }
  acknowledge(operationId: string) {
    this.assertCurrent();
    const id = canonicalUuidSchema.parse(operationId);
    return this.actions.run('acknowledge/' + id, async () => {
      this.invalidateReviews();
      await this.scope.repository.reservations.acknowledge(
        this.scope.context,
        this.scope.owner.principal,
        id,
        this.assertCurrent,
      );
      this.assertCurrent();
      return null;
    });
  }
}
