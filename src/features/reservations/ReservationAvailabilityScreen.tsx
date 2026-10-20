import { useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { canUse } from '../../core/capabilities';
import { reservationPartyBounds } from '../../api/reservationAvailability';
import type { TenantContext } from '../../core/tenantContext';
import type { CustomerTransport } from '../../core/transport';
import Screen from '../../ui/Screen';
import Button from '../../ui/Button';
import Feedback from '../../ui/Feedback';
import QuantityStepper from '../../ui/QuantityStepper';
import { spacing, typography, useTheme } from '../../ui/theme';
import { useRestaurant } from '../restaurant/RestaurantProvider';
import useBootstrap from '../restaurant/useBootstrap';
import ReservationDatePicker from './ReservationDatePicker';
import { reservationDay, reservationHour } from './reservationPresentation';
import { reservationToday } from './reservationCalendar';
import useReservationAvailability from './useReservationAvailability';

export default function ReservationAvailabilityScreen() {
  const { t } = useTranslation();
  const { client, context } = useRestaurant();
  const bootstrap = useBootstrap();
  if (!client || !context || !canUse(bootstrap.data, 'reservations') || !bootstrap.data?.timezone)
    return (
      <Screen>
        <Feedback
          loading={bootstrap.isPending}
          message={t(bootstrap.isPending ? 'loading' : 'reservationAvailabilityUnavailable')}
        />
      </Screen>
    );
  return (
    <AvailabilityBody
      key={context.environment + context.tenant.id + context.generation + bootstrap.data.timezone}
      client={client}
      context={context}
      zone={bootstrap.data.timezone}
    />
  );
}
function AvailabilityBody({
  client,
  context,
  zone,
}: Readonly<{ client: CustomerTransport; context: TenantContext; zone: string }>) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const today = reservationToday(zone);
  const [day, setDay] = useState(today);
  const [party, setParty] = useState(2);
  const [choosing, setChoosing] = useState(false);
  const page = useReservationAvailability(client, context, zone, {
    date: day,
    numberOfGuests: party,
  });
  const hour = (time: string) =>
    time === '1.00:00:00'
      ? t('reservationMidnight')
      : (reservationHour(time, i18n.language) ?? t('reservationTimeUnavailable'));
  return (
    <Screen>
      <FlatList
        data={page.data?.slots ?? []}
        keyExtractor={(slot) => slot.startTime + '/' + slot.endTime}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.content}>
            <Text accessibilityRole="header" style={[styles.heading, { color: theme.text }]}>
              {t('reservationAvailability')}
            </Text>
            <Text style={[styles.body, { color: theme.secondary }]}>{context.tenant.name}</Text>
            <Feedback message={t('receiptTimeZone', { zone })} />
            <Button
              secondary
              label={t('reservationDate', { date: reservationDay(day, i18n.language) })}
              onPress={() => setChoosing(true)}
            />
            <Text style={[styles.body, { color: theme.text }]}>{t('reservationPartySize')}</Text>
            <QuantityStepper
              label={t('reservationPartySize')}
              value={party}
              minimum={reservationPartyBounds.minimum}
              maximum={reservationPartyBounds.maximum}
              onChange={setParty}
            />
            {day < today ? <Feedback message={t('reservationPastDate')} /> : null}
            <Button
              label={t('reservationCheckTimes')}
              disabled={page.loading || day < today}
              onPress={page.read}
            />
            <Feedback message={t('reservationAvailabilityAdvisory')} />
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.slot, { borderColor: theme.border }]}>
            <Text style={[styles.body, { color: theme.text }]}>
              {t('reservationHours', { start: hour(item.startTime), end: hour(item.endTime) })}
            </Text>
          </View>
        )}
        ListEmptyComponent={
          <Feedback
            loading={page.loading}
            message={t(
              page.loading
                ? 'loading'
                : page.failed
                  ? 'reservationTimesFailed'
                  : page.data
                    ? 'reservationNoTimes'
                    : 'reservationChooseTimeInputs',
            )}
          />
        }
      />
      {choosing ? (
        <ReservationDatePicker
          key={today}
          day={day < today ? today : day}
          minimum={today}
          onChoose={(value) => {
            setDay(value);
            setChoosing(false);
          }}
          onClose={() => setChoosing(false)}
        />
      ) : null}
    </Screen>
  );
}
const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingVertical: spacing.md },
  heading: { fontSize: typography.heading, fontWeight: '600' },
  body: { fontSize: typography.body },
  slot: { minHeight: 48, borderWidth: 1, borderRadius: 12, padding: spacing.md },
});
