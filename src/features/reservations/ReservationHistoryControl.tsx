import CustomerModuleControl from '../account/CustomerModuleControl';
import ReservationHistoryModal from './ReservationHistoryModal';

export default function ReservationHistoryControl() {
  return (
    <CustomerModuleControl
      capability="reservations"
      label="reservationHistory"
      renderModal={(props) => <ReservationHistoryModal {...props} />}
    />
  );
}
