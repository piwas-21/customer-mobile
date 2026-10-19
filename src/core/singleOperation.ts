import { ApiFailure } from './apiFailure';
// Coalesce an identical active intent; a different concurrent action must wait for its outcome.
export class SingleOperation<Result> {
  private active: { key: string; promise: Promise<Result> } | null = null;
  get busy() {
    return this.active !== null;
  }
  run(key: string, work: () => Promise<Result>): Promise<Result> {
    if (this.active) {
      if (this.active.key !== key) throw new ApiFailure(409, 'refused');
      return this.active.promise;
    }
    const promise = work().finally(() => {
      if (this.active?.promise === promise) this.active = null;
    });
    this.active = { key, promise };
    return promise;
  }
}
