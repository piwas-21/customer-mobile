import { z } from 'zod';
import type { SessionController } from '../core/sessionController';
export const accountDeletionSchema = z.discriminatedUnion('state', [
  z
    .object({
      schemaVersion: z.literal(1),
      state: z.literal('not-requested'),
      scheduledAtUtc: z.null(),
    })
    .strict(),
  z
    .object({
      schemaVersion: z.literal(1),
      state: z.literal('scheduled'),
      scheduledAtUtc: z.iso.datetime(),
    })
    .strict(),
]);
export type AccountDeletionStatus = z.infer<typeof accountDeletionSchema>;
const path = '/api/customer-mobile/account/deletion';
export function readAccountDeletion(controller: SessionController, userId: string) {
  return controller.get(userId, path, accountDeletionSchema);
}
export function requestAccountDeletion(
  controller: SessionController,
  userId: string,
  locale: string,
) {
  return controller.write(
    userId,
    `${path}/request`,
    { schemaVersion: 1 },
    accountDeletionSchema,
    locale,
    'POST',
  );
}
