import { FlatList, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { readLoyaltyBalance, readLoyaltyHistory, type LoyaltyCursor } from '../../api/loyalty';
import usePrivatePages from '../../core/usePrivatePages';
import BaseModal from '../../ui/BaseModal';
import Button from '../../ui/Button';
import Feedback from '../../ui/Feedback';
import { listSummaryStyles as styles } from '../../ui/listSummaryStyles';
import { useTheme } from '../../ui/theme';
import type { CustomerModuleModalProps } from '../account/CustomerModuleControl';

export default function LoyaltyModal(props: CustomerModuleModalProps) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const balance = usePrivatePages(
    props.context,
    props.userId,
    props.ownerVersion,
    'loyalty-balance',
    () => readLoyaltyBalance(props.controller, props.userId),
    () => null,
  );
  const history = usePrivatePages(
    props.context,
    props.userId,
    props.ownerVersion,
    'loyalty-history',
    (cursor?: LoyaltyCursor) => readLoyaltyHistory(props.controller, props.userId, cursor),
    (data) => data.next,
  );
  const count = new Intl.NumberFormat(i18n.language);
  const signed = new Intl.NumberFormat(i18n.language, { signDisplay: 'exceptZero' });
  const date = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: props.zone,
  });
  const when = (value: string) => date.format(new Date(value));
  const body = [styles.body, { color: theme.text }];
  let message = 'loyaltyEmpty';
  if (history.loading) message = 'loading';
  else if (history.failed) message = 'loyaltyUnavailable';
  return (
    <BaseModal title={t('loyaltyTitle')} onClose={props.onClose} scroll={false}>
      <FlatList
        data={history.data?.items ?? []}
        keyExtractor={(item) => item.transactionId}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.content}>
            {balance.data ? (
              <>
                <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
                  {t('loyaltyBalance', { points: count.format(balance.data.currentPoints) })}
                </Text>
                <Text style={body}>
                  {t('loyaltyEarned', { points: count.format(balance.data.totalEarnedPoints) })}
                </Text>
                <Text style={body}>
                  {t('loyaltyRedeemed', { points: count.format(balance.data.totalRedeemedPoints) })}
                </Text>
                {balance.data.lastUpdated ? (
                  <Text style={body}>
                    {t('loyaltyUpdated', { date: when(balance.data.lastUpdated) })}
                  </Text>
                ) : null}
              </>
            ) : (
              <Feedback
                loading={balance.loading}
                message={t(balance.loading ? 'loading' : 'loyaltyUnavailable')}
              />
            )}
            <Feedback message={t('loyaltyCheckoutHint')} />
            <Feedback message={t('receiptTimeZone', { zone: props.zone })} />
            <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
              {t('loyaltyHistory')}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.row, { borderColor: theme.border }]}>
            <Text style={body}>
              {t('loyaltyMovement', {
                kind: t('loyaltyKind.' + item.kind),
                points: signed.format(item.points),
              })}
            </Text>
            <Text style={body}>{when(item.createdAt)}</Text>
            {item.expiresAt ? (
              <Text style={body}>{t('loyaltyExpires', { date: when(item.expiresAt) })}</Text>
            ) : null}
          </View>
        )}
        ListEmptyComponent={<Feedback loading={history.loading} message={t(message)} />}
        ListFooterComponent={
          <View style={styles.content}>
            <Button
              secondary
              label={t('loyaltyRefresh')}
              disabled={balance.loading || history.loading}
              onPress={() => {
                balance.refresh();
                history.refresh();
              }}
            />
            {history.hasPrevious ? (
              <Button
                secondary
                label={t('loyaltyPrevious')}
                disabled={history.loading}
                onPress={history.previous}
              />
            ) : null}
            {history.hasNext ? (
              <Button
                secondary
                label={t('loyaltyNext')}
                disabled={history.loading}
                onPress={history.next}
              />
            ) : null}
          </View>
        }
      />
      <Button label={t('close')} secondary onPress={props.onClose} />
    </BaseModal>
  );
}
