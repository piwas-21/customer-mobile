import AsyncStorage from '@react-native-async-storage/async-storage';
import { environmentSchema, type Directory, type Environment } from '../core/directory';
import {
  latestMenuRetention,
  menuIsRetained,
  menuRetentionHasValidDate,
  menuRetentionFromDirectory,
  type PublicMenuRetention,
} from '../domain/publicMenuRetention';
import {
  menuSnapshotIsFresh,
  publicMenuSnapshotSchema,
  snapshotIdentity,
  PUBLIC_MENU_MAX_SNAPSHOTS,
  type PublicMenuSnapshot,
} from '../domain/publicMenuSnapshot';
import {
  decodePublicMenus,
  encodePublicMenus,
  type PublicMenuEnvelope,
} from './publicMenuEnvelope';
type Storage = Pick<typeof AsyncStorage, 'getItem' | 'setItem'>;
function key(environment: Environment) {
  return 'public.v1.' + environmentSchema.parse(environment) + '.menu-previews';
}
/** Public display-only retention. This state never supplies a network origin or customer authority. */
export class PublicMenuCache {
  private readonly pending = new Map<Environment, Promise<void>>();
  private readonly retention = new Map<Environment, PublicMenuRetention>();
  constructor(private readonly storage: Storage) {}
  private remember(environment: Environment, policy: PublicMenuRetention | undefined, now: number) {
    const previous = this.retention.get(environment);
    const current = latestMenuRetention(
      previous && menuRetentionHasValidDate(previous, now) ? previous : undefined,
      policy,
    );
    if (current) this.retention.set(environment, current);
    else this.retention.delete(environment);
    return current;
  }
  private async load(environment: Environment, now: number) {
    const state = decodePublicMenus(await this.storage.getItem(key(environment)), environment, now);
    const retention = this.remember(environment, state.retention, now);
    return {
      ...state,
      retention,
      snapshots: state.snapshots.filter((value) => menuIsRetained(retention, value.tenantId)),
    };
  }
  async read(environment: Environment, now = Date.now()) {
    return (await this.load(environment, now)).snapshots;
  }
  private update(environment: Environment, action: () => Promise<void>) {
    const previous = this.pending.get(environment) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(action);
    this.pending.set(environment, next);
    void next
      .finally(() => {
        if (this.pending.get(environment) === next) this.pending.delete(environment);
      })
      .catch(() => undefined);
    return next;
  }
  private async write(environment: Environment, state: PublicMenuEnvelope, acknowledge = false) {
    const raw = encodePublicMenus(state);
    await this.storage.setItem(key(environment), raw);
    if (acknowledge && (await this.storage.getItem(key(environment))) !== raw)
      throw new Error('Saved menu cleanup is unconfirmed');
  }
  save(environment: Environment, input: PublicMenuSnapshot, now = Date.now()) {
    const snapshot = publicMenuSnapshotSchema.parse(input);
    key(environment);
    if (!menuSnapshotIsFresh(snapshot, now)) throw new Error('Saved menu timestamp is invalid');
    return this.update(environment, async () => {
      const state = await this.load(environment, now);
      if (!menuIsRetained(this.retention.get(environment), snapshot.tenantId))
        throw new Error('This restaurant no longer permits a saved menu');
      const identity = snapshotIdentity(snapshot);
      if (
        state.snapshots.some(
          (value) =>
            snapshotIdentity(value) === identity &&
            Date.parse(value.capturedAt) > Date.parse(snapshot.capturedAt),
        )
      )
        return;
      const snapshots = [
        snapshot,
        ...state.snapshots.filter((value) => snapshotIdentity(value) !== identity),
      ]
        .sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt))
        .slice(0, PUBLIC_MENU_MAX_SNAPSHOTS);
      await this.write(environment, { ...state, snapshots });
    });
  }
  remove(environment: Environment, identity: string) {
    key(environment);
    return this.update(environment, async () => {
      const state = await this.load(environment, Date.now());
      await this.write(environment, {
        ...state,
        snapshots: state.snapshots.filter((value) => snapshotIdentity(value) !== identity),
      });
    });
  }
  reconcile(directory: Directory, now = Date.now()) {
    // Install the in-memory fence synchronously, including while an older disk write is pending.
    const observed = menuRetentionFromDirectory(directory, now);
    const environment = observed.environment;
    this.remember(environment, observed, now);
    return this.update(environment, async () => {
      const state = await this.load(environment, now);
      await this.write(environment, state, true);
    });
  }
}
const cache = new PublicMenuCache(AsyncStorage);
export const readPublicMenus = (environment: Environment, now?: number) =>
  cache.read(environment, now);
export const savePublicMenu = (environment: Environment, input: PublicMenuSnapshot, now?: number) =>
  cache.save(environment, input, now);
export const removePublicMenu = (environment: Environment, identity: string) =>
  cache.remove(environment, identity);
export const reconcilePublicMenus = (directory: Directory, now?: number) =>
  cache.reconcile(directory, now);
