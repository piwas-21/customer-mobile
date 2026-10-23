import { PreparedOperationReview } from './preparedOperationReview';
import { SingleOperation } from './singleOperation';
import { canonicalUuidSchema } from './identifiers';
import { ApiFailure } from './apiFailure';
type Original = { proof: { operationId: string } };
export class ReviewedTableOperation<
  Choice,
  Candidate extends { prepared: Original },
  Record,
  View,
  ReviewView,
> {
  private readonly preparations = new SingleOperation<ReviewView>();
  constructor(
    private readonly review: PreparedOperationReview<Candidate>,
    private readonly mutations: SingleOperation<View | null>,
    private readonly policy: {
      assertStart: () => void;
      load: (guard: () => void) => Promise<Record | null>;
      prepare: (choice: Choice, locale: string, guard: () => void) => Promise<Candidate>;
      project: (candidate: Candidate) => ReviewView;
      validate: (candidate: Candidate, locale: string, guard: () => void) => Promise<void>;
      install: (candidate: Candidate) => Promise<Record>;
      submit: (record: Record, candidate: Candidate, locale: string) => Promise<View | null>;
    },
  ) {}
  prepare(choice: Choice, locale: string) {
    this.policy.assertStart();
    if (this.mutations.busy) throw new ApiFailure(409, 'refused');
    return this.preparations.run(JSON.stringify(choice), async () => {
      const guard = this.review.guard(this.policy.assertStart, () => this.mutations.busy);
      if (await this.policy.load(guard)) throw new ApiFailure(409, 'refused');
      const candidate = await this.policy.prepare(choice, locale, guard);
      if (await this.policy.load(guard)) throw new ApiFailure(409, 'refused');
      guard();
      this.review.current = candidate;
      return this.policy.project(candidate);
    });
  }
  confirm(operationId: string, locale: string) {
    this.policy.assertStart();
    const id = canonicalUuidSchema.parse(operationId);
    return this.mutations.run('confirm/' + id, async () => {
      const candidate = this.review.current;
      if (candidate?.prepared.proof.operationId !== id) throw new ApiFailure(409, 'refused');
      const guard = () => {
        this.policy.assertStart();
        if (this.review.current !== candidate) throw new ApiFailure(409, 'refused');
      };
      try {
        if (await this.policy.load(guard)) throw new ApiFailure(409, 'refused');
        await this.policy.validate(candidate, locale, guard);
        guard();
        this.review.invalidate();
        const record = await this.policy.install(candidate);
        return this.policy.submit(record, candidate, locale);
      } catch (error) {
        this.review.invalidate();
        throw error;
      }
    });
  }
}
