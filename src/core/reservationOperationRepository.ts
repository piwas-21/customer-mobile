import {
  reservationCancellationPreparationSchema,
  type ReservationCancellationPreparation,
} from './reservationCancellationPreparation';
import { bindPreparedReservationCancellation } from '../api/reservationCancellationContract';
import {
  bindPreparedReservation,
  reservationCreateResolutionSchema,
  type ReservationCreateProof,
  type ReservationCreateResolution,
} from '../api/reservationCreateContract';
import { canonicalUuidSchema } from './identifiers';
import type { Principal, SecretStore } from './credentials';
import { principalSchema } from './credentials';
import {
  reservationPreparationSchema,
  scopedReservationRecord,
  type ReservationOperationRecord,
  type ReservationPreparation,
} from './reservationOperationRecord';
import { assertReservationScope, preparedReservationRecord } from './reservationOperationRecord';
import { ReservationOperationStorage } from './reservationOperationStorage';
import type { SerialTasks } from './serialTasks';
import type { TenantContext } from './tenantContext';
export class ReservationOperationRepository {
  private readonly storage: ReservationOperationStorage;
  constructor(
    store: SecretStore,
    private readonly tasks: SerialTasks,
  ) {
    this.storage = new ReservationOperationStorage(store);
  }
  load(context: TenantContext, principal: Principal, assertCurrent: () => void) {
    const owner = principalSchema.parse(principal);
    return this.tasks.run(() => this.storage.read(context, owner, assertCurrent));
  }
  intent(context: TenantContext, principal: Principal, assertCurrent: () => void) {
    const owner = principalSchema.parse(principal);
    return this.tasks.run(async () => {
      const record = await this.storage.read(context, owner, assertCurrent);
      if (!record || record.cancellation || record.cancellationRequested || record.resolution)
        return null;
      return this.storage.intent(context, record, assertCurrent);
    });
  }
  install(
    context: TenantContext,
    input: ReservationPreparation,
    response: ReservationCreateProof,
    assertCurrent: () => void,
  ) {
    const prepared = reservationPreparationSchema.parse(input);
    assertReservationScope(context, prepared.principal, prepared);
    const proof = bindPreparedReservation(prepared.draft, response);
    return this.tasks.run(async () => {
      if (await this.storage.read(context, prepared.principal, assertCurrent))
        throw new Error('Resolve the original reservation attempt first');
      const record = preparedReservationRecord(prepared, proof);
      // Private intent first; full creation requires durable exact readback of BOTH records.
      await this.storage.saveIntent(context, prepared.principal, prepared.draft, assertCurrent);
      await this.storage.save(context, record, assertCurrent);
      return record;
    });
  }
  installCancellation(
    context: TenantContext,
    input: ReservationCancellationPreparation,
    response: unknown,
    assertCurrent: () => void,
  ) {
    const prepared = reservationCancellationPreparationSchema.parse(input);
    assertReservationScope(context, prepared.principal, prepared);
    const result = bindPreparedReservationCancellation(prepared.request, response);
    return this.tasks.run(async () => {
      if (await this.storage.read(context, prepared.principal, assertCurrent))
        throw new Error('Resolve the original reservation attempt first');
      const record = preparedReservationRecord(prepared, result.proof, {
        reservationId: prepared.request.reservationId,
        timeZone: prepared.request.timeZone,
      });
      await this.storage.removeContact(context, prepared.principal, assertCurrent);
      await this.storage.save(context, record, assertCurrent);
      return record;
    });
  }
  blockCancellationRetry(
    context: TenantContext,
    input: ReservationOperationRecord,
    assertCurrent: () => void,
  ) {
    const expected = scopedReservationRecord(context, input.principal, input);
    return this.tasks.run(async () => {
      const record = await this.original(
        context,
        expected.principal,
        expected.proof.operationId,
        assertCurrent,
      );
      if (!record.cancellation) throw new Error('Original cancellation attempt unavailable');
      if (record.resolution || record.cancellationRequested) return;
      await this.storage.save(
        context,
        { ...record, cancellation: { ...record.cancellation, retryBlocked: true } },
        assertCurrent,
      );
    });
  }
  requestCancellation(
    context: TenantContext,
    principal: Principal,
    operationId: string,
    assertCurrent: () => void,
  ) {
    const owner = principalSchema.parse(principal);
    const expectedId = canonicalUuidSchema.parse(operationId);
    return this.tasks.run(async () => {
      const record = await this.original(context, owner, expectedId, assertCurrent);
      if (record.resolution || record.cancellationRequested) return record;
      const cancelling = { ...record, cancellationRequested: true };
      await this.storage.save(context, cancelling, assertCurrent);
      // After this acknowledgement no later retry may dispatch the private create body.
      await this.storage.removeContact(context, owner, assertCurrent);
      return cancelling;
    });
  }
  private async original(
    context: TenantContext,
    owner: Principal,
    operationId: string,
    assertCurrent: () => void,
  ) {
    const record = await this.storage.read(context, owner, assertCurrent);
    if (record?.proof.operationId !== operationId)
      throw new Error('Original reservation attempt unavailable');
    return record;
  }
  finish(
    context: TenantContext,
    principal: Principal,
    input: ReservationCreateResolution,
    assertCurrent: () => void,
  ) {
    const owner = principalSchema.parse(principal);
    const result = reservationCreateResolutionSchema.parse(input);
    return this.tasks.run(async () => {
      const record = await this.storage.read(context, owner, assertCurrent);
      if (record?.proof.operationId !== result.operationId)
        throw new Error('Original reservation attempt changed');
      if (result.outcome === 'Unseen') {
        if (record.resolution) throw new Error('A known reservation decision cannot become unseen');
        return record; // An observation cannot release or replace the pending operation.
      }
      if (record.resolution && JSON.stringify(record.resolution) !== JSON.stringify(result))
        throw new Error('Original reservation decision changed');
      const finished = { ...record, resolution: result };
      await this.storage.save(context, finished, assertCurrent);
      await this.storage.removeContact(context, owner, assertCurrent);
      return finished;
    });
  }
  acknowledge(
    context: TenantContext,
    principal: Principal,
    operationId: string,
    assertCurrent: () => void,
  ) {
    const owner = principalSchema.parse(principal);
    return this.tasks.run(async () => {
      const record = await this.storage.read(context, owner, assertCurrent);
      if (!record?.resolution || record.proof.operationId !== operationId)
        throw new Error('Only a known original reservation decision can be dismissed');
      await this.storage.removeContact(context, owner, assertCurrent);
      await this.storage.removeProof(context, owner, assertCurrent);
    });
  }
}
