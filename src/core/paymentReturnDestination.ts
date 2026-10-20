import type { Directory } from './directory';
import { resolveLink } from './links';
export function paymentReturnDestination(value: string, origin: string, directory: Directory) {
  const result = resolveLink(value, origin, directory);
  if (result.destination !== 'payment-return') throw new Error('Payment destination required');
  // The link contains navigation references only. No claim about settlement reaches the UI.
  return { tenantId: result.tenantId, pathname: '/orders' as const };
}
