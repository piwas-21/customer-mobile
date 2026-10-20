import { z } from 'zod';
import type { Environment } from '../core/directory';
import {
  menuRetentionHasValidDate,
  publicMenuRetentionSchema,
} from '../domain/publicMenuRetention';
import {
  menuSnapshotIsFresh,
  publicMenuSnapshotSchema,
  snapshotIdentity,
  PUBLIC_MENU_MAX_SNAPSHOTS,
  PUBLIC_MENU_MAX_TEXT_UNITS,
} from '../domain/publicMenuSnapshot';
const schema = z
  .strictObject({
    schemaVersion: z.literal(1),
    snapshots: z.array(publicMenuSnapshotSchema).max(PUBLIC_MENU_MAX_SNAPSHOTS),
    retention: publicMenuRetentionSchema.optional(),
  })
  .refine(
    (value) => new Set(value.snapshots.map(snapshotIdentity)).size === value.snapshots.length,
  );
export type PublicMenuEnvelope = z.infer<typeof schema>;
export function decodePublicMenus(
  raw: string | null,
  environment: Environment,
  now: number,
): PublicMenuEnvelope {
  const empty: PublicMenuEnvelope = { schemaVersion: 1, snapshots: [] };
  if (!raw || raw.length > PUBLIC_MENU_MAX_TEXT_UNITS) return empty;
  try {
    const value = schema.parse(JSON.parse(raw));
    if (
      value.retention &&
      (value.retention.environment !== environment ||
        !menuRetentionHasValidDate(value.retention, now))
    )
      return empty;
    return {
      ...value,
      snapshots: value.snapshots.filter((snapshot) => menuSnapshotIsFresh(snapshot, now)),
    };
  } catch {
    return empty;
  }
}
export function encodePublicMenus(value: PublicMenuEnvelope) {
  const envelope = schema.parse(value);
  let raw = JSON.stringify(envelope);
  while (raw.length > PUBLIC_MENU_MAX_TEXT_UNITS && envelope.snapshots.length > 1) {
    envelope.snapshots.pop();
    raw = JSON.stringify(envelope);
  }
  if (raw.length > PUBLIC_MENU_MAX_TEXT_UNITS)
    throw new Error('Saved menu exceeds its text budget');
  return raw;
}
