import { CustomerOperationScope } from './customerOperationScope';
import { reservationEditInputSchema } from '../api/reservationEditContract';
import { reservationAttemptView } from './reservationAttemptView';
import {
  dispatchReservationCreation,
  canStartReservation,
  requireFreshReservationConfiguration,
} from './reservationCreationPolicy';
import { resolveReservationAttempt } from '../api/reservationCreate';
import type { ReservationOperationRecord } from './reservationOperationRecord';
import { ApiFailure } from './transport';
export class ReservationOperationScope extends CustomerOperationScope {
  private refusedMutation: string | undefined;
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
    const target = record.cancellation ?? record.edit;
    if (!target || record.cancellationRequested || target.retryBlocked)
      throw new ApiFailure(409, 'refused');
    await this.fresh(target.timeZone);
    const draft = record.edit
      ? reservationEditInputSchema.parse(
          await this.repository.reservations.intent(
            this.context,
            record.principal,
            this.assertCurrent,
          ),
        )
      : undefined;
    try {
      return await resolveReservationAttempt(
        this.client,
        this.context,
        record,
        'submit',
        this.assertCurrent,
        locale,
        draft,
      );
    } catch (error) {
      if (error instanceof ApiFailure && error.status === 409 && error.reason === 'http') {
        this.refusedMutation = record.proof.operationId;
        try {
          await this.repository.reservations.blockMutationRetry(
            this.context,
            record,
            this.assertCurrent,
          );
        } catch {
          // Pending booking changes are recovery-only even if this diagnostic cannot persist.
        }
      }
      throw error;
    }
  }
  async view(record: ReservationOperationRecord) {
    const value = await reservationAttemptView(
      this.context,
      this.repository,
      record,
      this.assertCurrent,
      this.configuration,
    );
    if (record.proof.operationId !== this.refusedMutation) return value;
    if (!record.resolution) return { ...value, retryBlocked: true as const };
    this.refusedMutation = undefined;
    return value;
  }
}
