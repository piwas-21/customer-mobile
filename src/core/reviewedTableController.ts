import { TableOperationController } from './tableOperationController';
import type { ReviewedTableOperation } from './reviewedTableOperation';
type Original = { proof: { operationId: string } };
export abstract class ReviewedTableController<
  Choice,
  Candidate extends { prepared: Original },
  Record extends Original,
  View,
  Owner extends {
    assertCurrent: () => void;
    owner: { dispose: () => void };
    load: () => Promise<Record | null>;
  },
  ReviewView,
> extends TableOperationController<Candidate, Record, View, Owner> {
  protected abstract readonly prepared: ReviewedTableOperation<
    Choice,
    Candidate,
    Record,
    View,
    ReviewView
  >;
  protected abstract readonly captureChoice: (input: Choice) => Choice;
  prepare(input: Choice, locale: string) {
    return this.prepared.prepare(this.captureChoice(input), locale);
  }
  confirm(operationId: string, locale: string) {
    return this.prepared.confirm(operationId, locale);
  }
}
