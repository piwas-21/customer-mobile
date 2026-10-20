import { SingleOperation } from './singleOperation';
import { canonicalUuidSchema } from './identifiers';
import { ApiFailure } from './apiFailure';
import type { ReservationAttemptView } from './reservationAttemptView';
import type { ReservationOperationRecord } from './reservationOperationRecord';
import type { ReservationOperationScope } from './reservationOperationScope';
type Candidate = Readonly<{ operationId: string; timeZone: string }>;
type Definition<Input, Prepared extends Candidate, Review> = Readonly<{
  capture: (input: Input) => Input;
  zone: (input: Input) => string;
  prepare: (input: Input, guard: () => void, locale: string) => Promise<Prepared>;
  snapshot: (prepared: Prepared) => Review;
  install: (prepared: Prepared) => Promise<ReservationOperationRecord>;
}>;
// Owned changes share a volatile review lifetime and one durable initial submission.
export abstract class OwnedReservationReview<Input, Prepared extends Candidate, Review> {
  private candidate: Prepared | undefined;
  private revision = 0;
  private readonly preparation = new SingleOperation<Review>();
  protected constructor(
    protected readonly scope: ReservationOperationScope,
    private readonly mutations: SingleOperation<ReservationAttemptView | null>,
    private readonly definition: Definition<Input, Prepared, Review>,
  ) {}
  invalidate() {
    this.revision++;
    this.candidate = undefined;
  }
  dismiss(operationId: string) {
    this.scope.assertCurrent();
    if (this.candidate?.operationId === canonicalUuidSchema.parse(operationId)) this.invalidate();
  }
  prepare(input: Input, locale: string) {
    const captured = this.definition.capture(input);
    this.assertStart();
    if (this.mutations.busy) throw new ApiFailure(409, 'refused');
    return this.preparation.run('prepare/' + JSON.stringify(captured), async () => {
      this.invalidate();
      const revision = this.revision;
      const guard = () => {
        this.scope.assertCurrent();
        if (revision !== this.revision || this.mutations.busy) throw new ApiFailure(409, 'refused');
      };
      if (await this.scope.load()) throw new ApiFailure(409, 'refused');
      guard();
      await this.scope.fresh(this.definition.zone(captured));
      guard();
      const candidate = await this.definition.prepare(captured, guard, locale);
      guard();
      this.assertStart();
      if (await this.scope.load()) throw new ApiFailure(409, 'refused');
      guard();
      this.candidate = candidate;
      return this.definition.snapshot(candidate);
    });
  }
  async confirm(operationId: string, locale: string) {
    const id = canonicalUuidSchema.parse(operationId);
    this.assertStart();
    const candidate = this.candidate;
    if (candidate?.operationId !== id) throw new ApiFailure(409, 'refused');
    if (await this.scope.load()) throw new ApiFailure(409, 'refused');
    await this.scope.fresh(candidate.timeZone);
    this.assertStart();
    if (this.candidate !== candidate) throw new ApiFailure(409, 'refused');
    this.invalidate();
    const record = await this.definition.install(candidate);
    return this.scope.dispatch(record, 'submit', locale);
  }
  protected assertStart() {
    this.scope.assertStart();
    if (this.scope.owner.principal.kind !== 'customer') throw new ApiFailure(403, 'refused');
  }
}
