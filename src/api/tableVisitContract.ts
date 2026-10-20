import { z } from 'zod';
import { canonicalUuidSchema } from '../core/identifiers';
import { utcSortMarkerSchema } from '../core/utcSortMarker';
export const tableQrSchema = z
  .string()
  .min(1)
  .max(128)
  .refine((value) => value.length <= 128 && value.trim().length > 0);
export const tableVisitIdentitySchema = z.strictObject({
  serviceSessionId: canonicalUuidSchema,
  participantToken: z.string().regex(/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/),
  expiresAt: utcSortMarkerSchema,
});
export type TableVisitIdentity = z.infer<typeof tableVisitIdentitySchema>;
