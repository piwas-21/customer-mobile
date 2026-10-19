import { z } from 'zod';
import { basketAddInputSchema } from '../api/basketRequest';
import { basketChannelInputSchema } from '../api/basketChannel';
import { basketItemMutationSchema } from '../api/basketItemMutation';
import { principalSchema } from './credentials';
import { environmentSchema } from './directory';
import { canonicalUuidSchema, emptyUuid } from './identifiers';
const addIntent = z.object({ schemaVersion: z.literal(1), request: basketAddInputSchema }).strict();
const editIntent = z
  .object({ schemaVersion: z.literal(2), request: basketItemMutationSchema })
  .strict();
const channelIntent = z
  .object({ schemaVersion: z.literal(3), request: basketChannelInputSchema })
  .strict();
function cancellationReady(record: { cancellationRequested?: true | undefined; phase: string }) {
  return !record.cancellationRequested || record.phase === 'ready';
}
export const basketOperationIntentSchema = z.discriminatedUnion('schemaVersion', [
  addIntent,
  editIntent,
  channelIntent,
]);
export type BasketOperationIntent = z.infer<typeof basketOperationIntentSchema>;
const scope = {
  environment: environmentSchema,
  tenantId: z.uuid(),
  principal: principalSchema,
  sessionId: canonicalUuidSchema,
  operationId: canonicalUuidSchema,
  cancellationRequested: z.literal(true).optional(),
};
export const basketOperationRecordSchema = z.discriminatedUnion('schemaVersion', [
  addIntent
    .extend({ ...scope, phase: z.enum(['installing', 'ready']) })
    .refine(cancellationReady, 'A cancellation requires an installed basket session'),
  editIntent.extend({ ...scope, phase: z.literal('ready') }),
  channelIntent
    .extend({ ...scope, phase: z.enum(['installing', 'ready']) })
    .refine(cancellationReady, 'A cancellation requires an installed basket session')
    .refine(
      (record) => record.phase === 'ready' || record.request.expectedBasketId === emptyUuid,
      'An existing reviewed basket requires its installed session',
    ),
]);
export type BasketOperationRecord = z.infer<typeof basketOperationRecordSchema>;
type DeepReadonly<T> = T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T;
type ReadyRecord<T> = T extends BasketOperationRecord
  ? Omit<T, 'phase'> & { phase: 'ready' }
  : never;
export type PendingBasketOperation = DeepReadonly<ReadyRecord<BasketOperationRecord>>;

export function immutableBasketOperation(record: BasketOperationRecord): PendingBasketOperation {
  if (record.phase !== 'ready') throw new Error('Basket session installation incomplete');
  const ready = { ...record, phase: 'ready' as const };
  freezeValue(ready);
  return ready;
}
function freezeValue(value: unknown): void {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezeValue(child);
    Object.freeze(value);
  }
}
