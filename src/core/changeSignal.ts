// Shared synchronous notification for volatile private stores; payloads stay with their owner.
export class ChangeSignal {
  private readonly listeners = new Set<() => void>();
  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  publish() {
    for (const listener of this.listeners) listener();
  }
}
