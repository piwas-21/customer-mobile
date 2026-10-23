import type { Directory } from './directory';
import { resolveLink } from './links';
export function tablePaymentReturnDestination(value: string, origin: string, directory: Directory) {
  const result = resolveLink(value, origin, directory);
  if (result.destination !== 'table-payment-return' || !result.attemptId)
    throw new Error('Table payment destination required');
  // Public attempt references select navigation only; original private proof owns canonical recovery.
  return { tenantId: result.tenantId, pathname: '/table' as const };
}
