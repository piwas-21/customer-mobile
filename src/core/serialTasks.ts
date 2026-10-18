export class SerialTasks {
  private pending: Promise<unknown> = Promise.resolve();
  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.pending.then(task);
    this.pending = result.catch(() => undefined);
    return result;
  }
}
