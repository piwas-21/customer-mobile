import AsyncStorage from '@react-native-async-storage/async-storage';
import { z } from 'zod';
import { environmentSchema, type Environment } from '../core/directory';
import {
  menuSnapshotIsFresh,
  publicMenuSnapshotSchema,
  snapshotIdentity,
  PUBLIC_MENU_MAX_SNAPSHOTS,
  PUBLIC_MENU_MAX_TEXT_UNITS,
  type PublicMenuSnapshot,
} from '../domain/publicMenuSnapshot';
const schema = z
  .strictObject({
    schemaVersion: z.literal(1),
    snapshots: z.array(publicMenuSnapshotSchema).max(PUBLIC_MENU_MAX_SNAPSHOTS),
  })
  .refine(
    (value) => new Set(value.snapshots.map(snapshotIdentity)).size === value.snapshots.length,
  );
const pending = new Map<Environment, Promise<void>>();
function key(environment: Environment) {
  return 'public.v1.' + environmentSchema.parse(environment) + '.menu-previews';
}
export async function readPublicMenus(environment: Environment, now = Date.now()) {
  const raw = await AsyncStorage.getItem(key(environment));
  if (!raw || raw.length > PUBLIC_MENU_MAX_TEXT_UNITS) return [];
  try {
    return schema
      .parse(JSON.parse(raw))
      .snapshots.filter((snapshot) => menuSnapshotIsFresh(snapshot, now));
  } catch {
    return [];
  }
}
function update(environment: Environment, action: () => Promise<void>) {
  const previous = pending.get(environment) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(action);
  pending.set(environment, next);
  void next
    .finally(() => {
      if (pending.get(environment) === next) pending.delete(environment);
    })
    .catch(() => undefined);
  return next;
}
export function savePublicMenu(
  environment: Environment,
  input: PublicMenuSnapshot,
  now = Date.now(),
) {
  const snapshot = publicMenuSnapshotSchema.parse(input);
  const storageKey = key(environment);
  if (!menuSnapshotIsFresh(snapshot, now)) throw new Error('Saved menu timestamp is invalid');
  return update(environment, async () => {
    const existing = await readPublicMenus(environment, now);
    const identity = snapshotIdentity(snapshot);
    const newer = existing.find(
      (value) =>
        snapshotIdentity(value) === identity &&
        Date.parse(value.capturedAt) > Date.parse(snapshot.capturedAt),
    );
    if (newer) return;
    const snapshots = [
      snapshot,
      ...existing.filter((value) => snapshotIdentity(value) !== identity),
    ]
      .sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt))
      .slice(0, PUBLIC_MENU_MAX_SNAPSHOTS);
    let raw = JSON.stringify({ schemaVersion: 1, snapshots });
    while (raw.length > PUBLIC_MENU_MAX_TEXT_UNITS && snapshots.length > 1) {
      snapshots.pop();
      raw = JSON.stringify({ schemaVersion: 1, snapshots });
    }
    if (raw.length > PUBLIC_MENU_MAX_TEXT_UNITS)
      throw new Error('Saved menu exceeds its text budget');
    await AsyncStorage.setItem(storageKey, raw);
  });
}
export function removePublicMenu(environment: Environment, identity: string) {
  return update(environment, async () => {
    const snapshots = (await readPublicMenus(environment)).filter(
      (value) => snapshotIdentity(value) !== identity,
    );
    await AsyncStorage.setItem(key(environment), JSON.stringify({ schemaVersion: 1, snapshots }));
  });
}
