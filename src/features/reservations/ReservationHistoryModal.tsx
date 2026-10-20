import { useState } from 'react';
import { FlatList, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { readReservationHistory, type ReservationCursor } from '../../api/reservations';
import type { SessionController } from '../../core/sessionController';
import type { TenantContext } from '../../core/tenantContext';
import usePrivatePages from '../../core/usePrivatePages';
import BaseModal from '../../ui/BaseModal';
import Button from '../../ui/Button';
import Feedback from '../../ui/Feedback';
import { listSummaryStyles as styles } from '../../ui/listSummaryStyles';
import { useTheme } from '../../ui/theme';
import ReservationDetailModal from './ReservationDetailModal';
import { reservationDay, reservationHour } from './reservationPresentation';
import ReservationSummary from './ReservationSummary';

type Props = Readonly<{
  context: TenantContext;
  controller: SessionController;
  userId: string;
  ownerVersion: string;
  onClose: () => void;
}>;
export default function ReservationHistoryModal(props: Props) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const [selected, setSelected] = useState<{ id: string; zone: string }>();
  const page = usePrivatePages(
    props.context,
    props.userId,
    props.ownerVersion,
    'reservation-history',
    (cursor?: ReservationCursor) => readReservationHistory(props.controller, props.userId, cursor),
    (data) => data.next,
  );
  if (selected)
    return (
      <ReservationDetailModal
        {...props}
        reservationId={selected.id}
        zone={selected.zone}
        onBack={() => setSelected(undefined)}
      />
    );
  let message = 'noReservations';
  if (page.loading) message = 'loading';
  else if (page.failed) message = 'reservationsUnavailable';
  return (
    <BaseModal title={t('reservationHistory')} onClose={props.onClose} scroll={false}>
      <FlatList
        data={page.data?.items ?? []}
        keyExtractor={(item) => item.reservationId}
        contentContainerStyle={styles.content}
        renderItem={({ item }) => (
          <View style={[styles.row, { borderColor: theme.border }]}>
            <ReservationSummary item={item} />
            <Button
              secondary
              label={t('viewReservation', {
                date: reservationDay(item.reservationDate, i18n.language),
                time:
                  reservationHour(item.startTime, i18n.language) ?? t('reservationTimeUnavailable'),
              })}
              onPress={() => {
                if (page.data) setSelected({ id: item.reservationId, zone: page.data.timeZone });
              }}
            />
          </View>
        )}
        ListHeaderComponent={
          page.data ? (
            <Feedback message={t('receiptTimeZone', { zone: page.data.timeZone })} />
          ) : null
        }
        ListEmptyComponent={<Feedback loading={page.loading} message={t(message)} />}
        ListFooterComponent={
          <View style={styles.content}>
            <Button
              secondary
              label={t('refreshReservations')}
              disabled={page.loading}
              onPress={page.refresh}
            />
            {page.hasPrevious ? (
              <Button
                secondary
                label={t('previousReservations')}
                disabled={page.loading}
                onPress={page.previous}
              />
            ) : null}
            {page.hasNext ? (
              <Button
                secondary
                label={t('nextReservations')}
                disabled={page.loading}
                onPress={page.next}
              />
            ) : null}
          </View>
        }
      />
      <Button label={t('close')} secondary onPress={props.onClose} />
    </BaseModal>
  );
}
