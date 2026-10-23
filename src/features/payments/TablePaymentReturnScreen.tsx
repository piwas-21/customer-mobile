import { tablePaymentReturnDestination } from '../../core/tablePaymentReturnDestination';
import PaymentReturnNavigation from './PaymentReturnNavigation';
export default function TablePaymentReturnScreen() {
  return <PaymentReturnNavigation resolve={tablePaymentReturnDestination} fallback="/table" />;
}
