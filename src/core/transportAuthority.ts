import { isReservationRecoveryPath } from './reservationPaths';
import { isTableRoundRecovery } from './tableRoundRequest';
import { isTableContributionRecovery } from './tableContributionRequest';
import type { RequestOptions } from './httpTypes';
export function isOriginalRecovery(path: string, method: string, options: RequestOptions) {
  if (method !== 'POST') return false;
  if (options.credentials === 'reservation-operation') return isReservationRecoveryPath(path);
  if (options.credentials === 'table-round-operation') return isTableRoundRecovery(path);
  if (
    options.credentials === 'table-payment-operation' ||
    options.credentials === 'table-checkout-operation'
  )
    return isTableContributionRecovery(path);
  return (
    options.credentials === 'order' &&
    (path === '/api/customer-mobile/checkout/recover' ||
      path === '/api/customer-mobile/checkout/cancel')
  );
}
export function isPrivateRenewal(mode: RequestOptions['credentials']) {
  return [
    'receipt-renewal',
    'payment-renewal',
    'cancellation-renewal',
    'reservation-renewal',
    'table-round-renewal',
    'table-payment-renewal',
  ].includes(mode ?? 'none');
}
