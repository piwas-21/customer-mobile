import { z } from 'zod';
import { basketAddInputSchema } from '../api/basketRequest';
import { principalSchema } from './credentials';
import { environmentSchema } from './directory';
import { canonicalUuidSchema } from './identifiers';
export const basketOperationRecordSchema = z
  .object({
    schemaVersion: z.literal(1),
    environment: environmentSchema,
    tenantId: z.uuid(),
    principal: principalSchema,
    sessionId: canonicalUuidSchema,
    operationId: canonicalUuidSchema,
    phase: z.enum(['installing', 'ready']),
    request: basketAddInputSchema,
  })
  .strict();
export type BasketOperationRecord = z.infer<typeof basketOperationRecordSchema>;
type DeepReadonly<T> = T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T;
export type PendingBasketOperation = DeepReadonly<
  Omit<BasketOperationRecord, 'phase'> & { phase: 'ready' }
>;

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
