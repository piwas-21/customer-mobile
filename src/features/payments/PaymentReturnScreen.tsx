import { paymentReturnDestination } from '../../core/paymentReturnDestination';
import PaymentReturnNavigation from './PaymentReturnNavigation';
export default function PaymentReturnScreen() {
  return <PaymentReturnNavigation resolve={paymentReturnDestination} fallback="/orders" />;
}
