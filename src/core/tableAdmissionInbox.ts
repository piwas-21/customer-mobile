import { ChangeSignal } from './changeSignal';
import { canonicalUuidSchema } from './identifiers';
import { tableQrSchema } from '../api/tableVisitContract';
const QR_REVIEW_LIFETIME_MS = 2 * 60_000;
// One volatile camera handoff. Public snapshots expose only a change counter, never QR authority.
export class TableAdmissionInbox {
  private pending: { tenantId: string; qr: string; receivedAt: number } | undefined;
  private revision = 0;
  private readonly changes = new ChangeSignal();
  readonly subscribe = this.changes.subscribe;
  readonly snapshot = () => this.revision;
  clear() {
    this.pending = undefined;
    this.revision++;
    this.changes.publish();
  }
  receive(tenantId: string, qr: string) {
    this.pending = undefined;
    try {
      this.pending = {
        tenantId: canonicalUuidSchema.parse(tenantId),
        qr: tableQrSchema.parse(qr),
        receivedAt: Date.now(),
      };
    } finally {
      this.revision++;
      this.changes.publish();
    }
  }
  take(tenantId: string) {
    const pending = this.pending;
    this.pending = undefined;
    if (
      !pending ||
      pending.tenantId !== canonicalUuidSchema.parse(tenantId) ||
      Date.now() - pending.receivedAt >= QR_REVIEW_LIFETIME_MS ||
      Date.now() < pending.receivedAt
    )
      return null;
    return pending.qr;
  }
}
export const tableAdmissionInbox = new TableAdmissionInbox();
