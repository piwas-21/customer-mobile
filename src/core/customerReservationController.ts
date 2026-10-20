import { createReservationPreparation } from './reservationOperationRecord';
import {
  canStartReservation,
  requireFreshReservationConfiguration,
} from './reservationCreationPolicy';
import { prepareReservation, resolveReservationAttempt } from '../api/reservationCreate';
import {
  reservationBookingInputSchema,
  type ReservationBookingInput,
} from '../api/reservationCreateContract';
import { bootstrapSchema, type Bootstrap } from './capabilities';
import { CustomerOperationOwner } from './customerOperationOwner';
import { canonicalUuidSchema } from './identifiers';
import type { Principal } from './credentials';
import type { ReservationOperationRecord } from './reservationOperationRecord';
import type { SessionRepository } from './sessionRepository';
import type { SessionController } from './sessionController';
import { SingleOperation } from './singleOperation';
import type { TenantContext } from './tenantContext';
import { ApiFailure, type CustomerTransport } from './transport';
import { reservationAttemptView, type ReservationAttemptView } from './reservationAttemptView';
export class CustomerReservationController {
  private readonly owner: CustomerOperationOwner;
  private readonly configuration: Bootstrap;
  private readonly actions = new SingleOperation<ReservationAttemptView | null>();
  constructor(
    private readonly context: TenantContext,
    private readonly client: CustomerTransport,
    private readonly repository: SessionRepository,
    sessions: SessionController,
    principal: Principal,
    private readonly createId: () => string,
    bootstrap: Bootstrap,
  ) {
    this.owner = new CustomerOperationOwner(context, sessions, principal);
    this.configuration = bootstrapSchema.parse(bootstrap);
  }
  readonly assertCurrent = () => this.owner.assertCurrent();
  dispose() {
    this.owner.dispose();
  }
  async saved() {
    const record = await this.load();
    return record ? this.view(record) : null;
  }
  create(input: ReservationBookingInput, locale: string) {
    const captured = reservationBookingInputSchema.parse(input);
    this.assertStart();
    return this.actions.run(JSON.stringify(captured), async () => {
      if (await this.load()) throw new ApiFailure(409, 'refused');
      await this.requireCurrentConfiguration(captured.timeZone);
      const preparation = createReservationPreparation(
        this.context,
        this.owner.principal,
        captured,
        this.createId,
      );
      const proof = await prepareReservation(
        this.client,
        this.context,
        preparation,
        this.assertCurrent,
        locale,
      );
      this.assertStart();
      const record = await this.repository.reservations.install(
        this.context,
        preparation,
        proof,
        this.assertCurrent,
      );
      return this.dispatch(record, 'create', locale);
    });
  }
  recover(locale: string) {
    this.assertCurrent();
    return this.actions.run('recover', async () => {
      const record = await this.load();
      return record ? this.dispatch(record, 'recover', locale) : null;
    });
  }
  retryOriginal(operationId: string, locale: string) {
    this.assertStart();
    const id = canonicalUuidSchema.parse(operationId);
    return this.actions.run('retry/' + id, async () => {
      const record = await this.load();
      if (
        !record ||
        record.proof.operationId !== id ||
        record.cancellationRequested ||
        record.resolution
      )
        throw new ApiFailure(409, 'refused');
      return this.dispatch(record, 'create', locale);
    });
  }
  cancelAttempt(locale: string) {
    this.assertCurrent();
    return this.actions.run('cancel', async () => {
      const record = await this.repository.reservations.requestCancellation(
        this.context,
        this.owner.principal,
        this.assertCurrent,
      );
      return this.dispatch(record, 'cancel-attempt', locale);
    });
  }
  acknowledge(operationId: string) {
    this.assertCurrent();
    const id = canonicalUuidSchema.parse(operationId);
    return this.actions.run('acknowledge/' + id, async () => {
      await this.repository.reservations.acknowledge(
        this.context,
        this.owner.principal,
        id,
        this.assertCurrent,
      );
      this.assertCurrent();
      return null;
    });
  }
  private load() {
    this.assertCurrent();
    return this.repository.reservations.load(
      this.context,
      this.owner.principal,
      this.assertCurrent,
    );
  }
  private assertStart() {
    this.assertCurrent();
    if (!canStartReservation(this.context, this.configuration, this.owner.principal))
      throw new ApiFailure(404, 'refused');
  }
  private requireCurrentConfiguration(zone: string) {
    return requireFreshReservationConfiguration(
      this.context,
      this.client,
      this.configuration,
      this.owner.principal,
      zone,
      this.assertCurrent,
    );
  }
  private async dispatch(
    record: ReservationOperationRecord,
    phase: 'create' | 'recover' | 'cancel-attempt',
    locale: string,
  ) {
    this.assertCurrent();
    let result = record.resolution;
    if (!result) {
      const draft =
        phase === 'create'
          ? await this.repository.reservations.intent(
              this.context,
              this.owner.principal,
              this.assertCurrent,
            )
          : null;
      if (phase === 'create') {
        if (!draft || record.cancellationRequested) throw new ApiFailure(409, 'refused');
        await this.requireCurrentConfiguration(draft.timeZone);
      }
      result = await resolveReservationAttempt(
        this.client,
        this.context,
        record,
        phase,
        this.assertCurrent,
        locale,
        draft ?? undefined,
      );
    }
    const final = await this.repository.reservations.finish(
      this.context,
      this.owner.principal,
      result,
      this.assertCurrent,
    );
    this.assertCurrent();
    return this.view(final);
  }
  private view(record: ReservationOperationRecord) {
    return reservationAttemptView(
      this.context,
      this.repository,
      record,
      this.assertCurrent,
      this.configuration,
    );
  }
}
