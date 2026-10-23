import { PreparedOperationReview } from './preparedOperationReview';
import { SingleOperation } from './singleOperation';
import { canonicalUuidSchema } from './identifiers';
import { ApiFailure } from './apiFailure';
type OperationRecord = { proof: { operationId: string } };
type Scope<Record> = {
  assertCurrent: () => void;
  owner: { dispose: () => void };
  load: () => Promise<Record | null>;
};
export abstract class TableOperationController<
  Candidate extends { prepared: OperationRecord },
  Record extends OperationRecord,
  View,
  Owner extends Scope<Record>,
> {
  protected readonly review = new PreparedOperationReview<Candidate>();
  protected readonly mutations = new SingleOperation<View | null>();
  constructor(
    protected readonly scope: Owner,
    private readonly view: (record: Record) => View,
    private readonly forget: (record: Record) => Promise<unknown>,
  ) {}
  readonly assertCurrent = () => this.scope.assertCurrent();
  dispose() {
    this.invalidateReview();
    this.scope.owner.dispose();
  }
  invalidateReview() {
    this.review.invalidate();
  }
  dismiss(operationId: string) {
    this.assertCurrent();
    this.review.dismiss(operationId);
  }
  async saved() {
    const record = await this.scope.load();
    this.assertCurrent();
    return record ? this.view(record) : null;
  }
  acknowledge(operationId: string) {
    this.assertCurrent();
    const id = canonicalUuidSchema.parse(operationId);
    return this.mutations.run('acknowledge/' + id, async () => {
      this.invalidateReview();
      const record = await this.scope.load();
      if (record?.proof.operationId !== id) throw new ApiFailure(409, 'refused');
      await this.forget(record);
      this.assertCurrent();
      return null;
    });
  }
}
