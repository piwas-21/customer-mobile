export class ApiFailure extends Error {
  constructor(
    readonly status: number,
    readonly reason: 'network' | 'http' | 'contract' | 'refused',
  ) {
    super(`Customer API ${reason}`);
  }
}
