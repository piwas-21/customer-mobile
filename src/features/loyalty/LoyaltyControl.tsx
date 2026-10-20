import CustomerModuleControl from '../account/CustomerModuleControl';
import LoyaltyModal from './LoyaltyModal';

export default function LoyaltyControl() {
  return (
    <CustomerModuleControl
      capability="loyalty"
      label="loyaltyTitle"
      renderModal={(props) => <LoyaltyModal {...props} />}
    />
  );
}
