import { bootstrapSchema, type Bootstrap } from './capabilities';
import { CustomerOperationOwner } from './customerOperationOwner';
import { reservationAttemptView } from './reservationAttemptView';
import {
  dispatchReservationCreation,
  canStartReservation,
  requireFreshReservationConfiguration,
} from './reservationCreationPolicy';
import { resolveReservationAttempt } from '../api/reservationCreate';
import type { ReservationOperationRecord } from './reservationOperationRecord';
import type { Principal } from './credentials';
import type { SessionRepository } from './sessionRepository';
import type { SessionController } from './sessionController';
import type { TenantContext } from './tenantContext';
import { ApiFailure, type CustomerTransport } from './transport';
export class ReservationOperationScope {
  readonly owner: CustomerOperationOwner;
  readonly configuration: Bootstrap;
  constructor(
    readonly context: TenantContext,
    readonly client: CustomerTransport,
    readonly repository: SessionRepository,
    readonly sessions: SessionController,
    principal: Principal,
    bootstrap: Bootstrap,
  ) {
    this.owner = new CustomerOperationOwner(context, sessions, principal);
    this.configuration = bootstrapSchema.parse(bootstrap);
  }
  readonly assertCurrent = () => this.owner.assertCurrent();
  load() {
    this.assertCurrent();
    return this.repository.reservations.load(
      this.context,
      this.owner.principal,
      this.assertCurrent,
    );
  }
  assertStart() {
    this.assertCurrent();
    if (!canStartReservation(this.context, this.configuration, this.owner.principal))
      throw new ApiFailure(404, 'refused');
  }
  fresh(zone: string) {
    return requireFreshReservationConfiguration(
      this.context,
      this.client,
      this.configuration,
      this.owner.principal,
      zone,
      this.assertCurrent,
    );
  }
  async dispatch(
    record: ReservationOperationRecord,
    phase: 'create' | 'submit' | 'recover' | 'cancel-attempt',
    locale: string,
  ) {
    this.assertCurrent();
    const result = record.resolution ?? (await this.resolve(record, phase, locale));
    const final = await this.repository.reservations.finish(
      this.context,
      this.owner.principal,
      result,
      this.assertCurrent,
    );
    this.assertCurrent();
    return this.view(final);
  }
  private resolve(
    record: ReservationOperationRecord,
    phase: 'create' | 'submit' | 'recover' | 'cancel-attempt',
    locale: string,
  ) {
    if (phase === 'create')
      return dispatchReservationCreation(
        this.context,
        this.client,
        this.repository,
        this.configuration,
        record,
        this.assertCurrent,
        locale,
      );
    if (phase === 'submit') return this.submit(record, locale);
    return this.sessions.recovery.reservation(record, phase, locale, this.assertCurrent);
  }
  private async submit(record: ReservationOperationRecord, locale: string) {
    if (!record.cancellation || record.cancellationRequested || record.cancellation.retryBlocked)
      throw new ApiFailure(409, 'refused');
    await this.fresh(record.cancellation.timeZone);
    try {
      return await resolveReservationAttempt(
        this.client,
        this.context,
        record,
        'submit',
        this.assertCurrent,
        locale,
      );
    } catch (error) {
      if (error instanceof ApiFailure && error.status === 409 && error.reason === 'http')
        await this.repository.reservations.blockCancellationRetry(
          this.context,
          record,
          this.assertCurrent,
        );
      throw error;
    }
  }
  view(record: ReservationOperationRecord) {
    return reservationAttemptView(
      this.context,
      this.repository,
      record,
      this.assertCurrent,
      this.configuration,
    );
  }
}
