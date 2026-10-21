import { ChangeSignal } from './changeSignal';
import { parseNativeAccountLink, type NativeAccountLink } from './nativeAccountLink';

const ACCOUNT_ACTION_LIFETIME_MS = 10 * 60_000;
export type PendingAccountAction = Readonly<{
  id: number;
  slug: string;
  action: NativeAccountLink['action'];
  expiresAt: number;
}>;
/** Proofs live only in this volatile slot; subscribers receive public navigation metadata. */
export class PendingAccountActions {
  private sequence = 0;
  private entry: { public: PendingAccountAction; proof: string | undefined } | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private viewSequence = 0;
  private readonly changes = new ChangeSignal();
  readonly subscribe = this.changes.subscribe;
  readonly snapshot = () => this.entry?.public;
  retain(id: number) {
    const view = ++this.viewSequence;
    return () => {
      queueMicrotask(() => {
        if (this.viewSequence === view) this.clear(id);
      });
    };
  }
  canTake(id: number) {
    return this.entry?.public.id === id && Boolean(this.entry.proof);
  }
  private publish() {
    this.changes.publish();
  }
  capture(value: string, origin: string, now = Date.now()) {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.entry = undefined;
    try {
      const link = parseNativeAccountLink(value, origin);
      this.entry = {
        public: Object.freeze({
          id: ++this.sequence,
          slug: link.slug,
          action: link.action,
          expiresAt: now + ACCOUNT_ACTION_LIFETIME_MS,
        }),
        proof: link.proof,
      };
      const id = this.entry.public.id;
      this.timer = setTimeout(() => this.clear(id), ACCOUNT_ACTION_LIFETIME_MS);
      return true;
    } catch {
      return false;
    } finally {
      this.publish();
    }
  }
  clear(id?: number) {
    if (id !== undefined && this.entry?.public.id !== id) return;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.entry = undefined;
    this.publish();
  }
  take(id: number, now = Date.now()) {
    const current = this.entry;
    if (!current?.proof || current.public.id !== id) throw new Error('Account link unavailable');
    const proof = current.proof;
    current.proof = undefined;
    if (current.public.expiresAt <= now) {
      this.clear(id);
      throw new Error('Account link expired');
    }
    return proof;
  }
}
export const pendingAccountActions = new PendingAccountActions();
