import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatTablePaymentMinor } from '../../domain/tablePaymentMoney';
import BaseModal from '../../ui/BaseModal';
import Button from '../../ui/Button';
import Feedback from '../../ui/Feedback';
import { spacing, typography, useTheme } from '../../ui/theme';
import useTablePaymentRead, { type TablePaymentViewScope } from './useTablePaymentRead';

export default function TablePaymentAccountModal({
  scope,
  onClose,
  onRefreshBill,
}: Readonly<{
  scope: TablePaymentViewScope;
  onClose: () => void;
  onRefreshBill: () => void;
}>) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const result = useTablePaymentRead(scope);
  const account = result.data?.account;
  const text = [styles.body, { color: theme.text }];
  const amount = (minor: number) => formatTablePaymentMinor(minor, scope.currency, i18n.language);
  const summary = account ? (
    <View style={styles.content}>
      <Text style={text}>
        {t('tablePaymentOutstanding', { amount: amount(account.outstandingMinor) })}
      </Text>
      <Text style={text}>
        {t('tablePaymentReserved', { amount: amount(account.reservedMinor) })}
      </Text>
      <Text style={text}>
        {t('tablePaymentAvailable', { amount: amount(account.availableMinor) })}
      </Text>
      <Text style={[styles.body, { color: theme.secondary }]}>
        {t('tablePaymentReservationHint')}
      </Text>
    </View>
  ) : (
    <Feedback
      loading={result.loading}
      message={t(result.loading ? 'loading' : 'tablePaymentReadFailed')}
    />
  );
  return (
    <BaseModal title={t('tablePaymentDetails')} onClose={onClose} scroll={false}>
      <Button label={t('close')} secondary onPress={onClose} />
      <FlatList
        data={account?.activeEqualSharePlan?.slots ?? []}
        keyExtractor={(slot) => String(slot.ordinal)}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.content}>
            {summary}
            <Button label={t('tablePaymentRefreshBill')} secondary onPress={onRefreshBill} />
          </View>
        }
        renderItem={({ item }) => (
          <Text style={text}>
            {t('tablePaymentShare', {
              position: new Intl.NumberFormat(i18n.language).format(item.ordinal),
              amount: amount(item.amountMinor),
              status: t(
                item.isAvailable ? 'tablePaymentShareAvailable' : 'tablePaymentShareUnavailable',
              ),
            })}
          </Text>
        )}
      />
    </BaseModal>
  );
}
const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.md },
  body: { fontSize: typography.body },
});
