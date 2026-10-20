import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ReservationItem } from '../../api/reservations';
import { listSummaryStyles as styles } from '../../ui/listSummaryStyles';
import { useTheme } from '../../ui/theme';
import { reservationDay, reservationHour, reservationStatusKey } from './reservationPresentation';

export default function ReservationSummary({
  item,
  requests = false,
}: Readonly<{ item: ReservationItem; requests?: boolean }>) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const start = reservationHour(item.startTime, i18n.language);
  const end = reservationHour(item.endTime, i18n.language);
  return (
    <View style={styles.content}>
      <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
        {reservationDay(item.reservationDate, i18n.language)}
      </Text>
      <Text style={[styles.body, { color: theme.text }]}>
        {start && end ? t('reservationHours', { start, end }) : t('reservationTimeUnavailable')}
      </Text>
      <Text style={[styles.body, { color: theme.text }]}>
        {t('reservationGuests', { count: item.numberOfGuests })}
      </Text>
      <Text style={[styles.body, { color: theme.secondary }]}>
        {t(reservationStatusKey(item.status))}
      </Text>
      {requests && item.specialRequests?.trim() ? (
        <View style={styles.content}>
          <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
            {t('reservationRequests')}
          </Text>
          <Text selectable style={[styles.body, { color: theme.text }]}>
            {item.specialRequests}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
