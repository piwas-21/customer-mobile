import { ApiFailure } from './apiFailure';
import { canonicalUuidSchema } from './identifiers';
type PreparedCandidate = { prepared: { proof: { operationId: string } } };
// Both table purchases consume volatile review before durable custody can begin.
export class PreparedOperationReview<Candidate extends PreparedCandidate> {
  current: Candidate | undefined;
  private revision = 0;
  invalidate() {
    this.revision++;
    this.current = undefined;
  }
  dismiss(operationId: string) {
    if (this.current?.prepared.proof.operationId === canonicalUuidSchema.parse(operationId))
      this.invalidate();
  }
  guard(assertStart: () => void, busy: () => boolean) {
    this.invalidate();
    const revision = this.revision;
    return () => {
      assertStart();
      if (revision !== this.revision || busy()) throw new ApiFailure(409, 'refused');
    };
  }
}
