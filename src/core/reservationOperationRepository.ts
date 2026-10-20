import {
  bindPreparedReservation,
  reservationCreateResolutionSchema,
  type ReservationCreateProof,
  type ReservationCreateResolution,
} from '../api/reservationCreateContract';
import type { Principal, SecretStore } from './credentials';
import { principalSchema } from './credentials';
import {
  reservationPreparationSchema,
  type ReservationPreparation,
} from './reservationOperationRecord';
import { assertReservationScope } from './reservationOperationRecord';
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
      if (!record || record.cancellationRequested || record.resolution) return null;
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
      const record = {
        schemaVersion: 1 as const,
        environment: prepared.environment,
        tenantId: prepared.tenantId,
        principal: prepared.principal,
        sessionId: prepared.sessionId,
        proof,
        cancellationRequested: false,
        resolution: null,
      };
      // Private intent first; full creation requires durable exact readback of BOTH records.
      await this.storage.saveIntent(context, prepared.principal, prepared.draft, assertCurrent);
      await this.storage.save(context, record, assertCurrent);
      return record;
    });
  }
  requestCancellation(context: TenantContext, principal: Principal, assertCurrent: () => void) {
    const owner = principalSchema.parse(principal);
    return this.tasks.run(async () => {
      const record = await this.storage.read(context, owner, assertCurrent);
      if (!record) throw new Error('Original reservation attempt unavailable');
      if (record.resolution || record.cancellationRequested) return record;
      const cancelling = { ...record, cancellationRequested: true };
      await this.storage.save(context, cancelling, assertCurrent);
      // After this acknowledgement no later retry may dispatch the private create body.
      await this.storage.removeContact(context, owner, assertCurrent);
      return cancelling;
    });
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
      if (!record || record.proof.operationId !== result.operationId)
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
