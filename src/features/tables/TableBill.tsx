import { useMemo } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TableAccount } from '../../api/tableAccountContract';
import { tableAccountRows, type TableAccountRow } from './tableAccountRows';
import Feedback from '../../ui/Feedback';
import { spacing, typography, useTheme } from '../../ui/theme';
export default function TableBill({ account }: Readonly<{ account: TableAccount }>) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const rows = useMemo(() => {
    try {
      return tableAccountRows(account);
    } catch {
      return null;
    }
  }, [account]);
  if (!rows) return <Feedback message={t('tableAccountFailed')} />;
  if (!account.currency) return <Feedback message={t('tableCurrencyUnavailable')} />;
  const currency = account.currency;
  const price = (amount: number) =>
    new Intl.NumberFormat(i18n.language, { style: 'currency', currency }).format(amount);
  const summary = [
    ...(account.originalTotal === undefined
      ? []
      : [{ key: 'tableOriginalTotal', amount: account.originalTotal }]),
    ...(account.billingCreditAmount
      ? [{ key: 'tableBillingCredit', amount: account.billingCreditAmount }]
      : []),
    { key: 'tableCurrentTotal', amount: account.total },
    { key: 'tablePaid', amount: account.totalPaid },
    { key: 'tableRemaining', amount: account.remaining },
    ...(account.credit ? [{ key: 'tableCredit', amount: account.credit }] : []),
  ];
  return (
    <FlatList
      data={rows}
      keyExtractor={(row) => row.key}
      contentContainerStyle={styles.content}
      ListHeaderComponent={
        <View style={styles.content}>
          {account.tableLabel ? (
            <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
              {t('tableAt', { label: account.tableLabel })}
            </Text>
          ) : null}
          {summary.map((row) => (
            <Text key={row.key} style={[styles.body, { color: theme.text }]}>
              {t(row.key, { amount: price(row.amount) })}
            </Text>
          ))}
          {account.billingCreditAmount ? (
            <Text style={[styles.body, { color: theme.secondary }]}>
              {t('tableOriginalItemsHint')}
            </Text>
          ) : null}
        </View>
      }
      ListEmptyComponent={<Feedback message={t('tableNoOrders')} />}
      renderItem={({ item }) => <BillRow row={item} price={price} />}
    />
  );
}
function BillRow({
  row,
  price,
}: Readonly<{ row: TableAccountRow; price: (amount: number) => string }>) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const body = [styles.body, { color: theme.text }];
  if (row.kind === 'order')
    return (
      <View style={[styles.order, { borderColor: theme.border }]}>
        <Text accessibilityRole="header" style={body}>
          {t('tableRound', {
            number:
              row.order.dailyOrderNumber > 0
                ? new Intl.NumberFormat(i18n.language).format(row.order.dailyOrderNumber)
                : row.order.orderNumber,
          })}
        </Text>
        <Text style={body}>
          {t('tableRoundTotal', { amount: price(row.order.payableTotal ?? row.order.total) })}
        </Text>
      </View>
    );
  return (
    <View style={[styles.content, { paddingStart: spacing.md * Math.min(row.depth, 3) }]}>
      <Text style={body}>
        {t('tableLine', {
          quantity: new Intl.NumberFormat(i18n.language).format(row.item.quantity),
          name: row.item.productName,
        })}
      </Text>
      {row.item.variationName ? <Text style={body}>{row.item.variationName}</Text> : null}
      <Text style={body}>{price(row.item.itemTotal)}</Text>
      {row.item.ingredientCustomizations.map((ingredient, index) => {
        let name = ingredient.name;
        if (ingredient.removed) name = t('withoutIngredient', { name });
        else if (ingredient.addOn) name = t('tableIngredientExtra', { name });
        return (
          <Text key={index} style={[styles.body, { color: theme.secondary }]}>
            {t('tableLine', {
              quantity: new Intl.NumberFormat(i18n.language).format(ingredient.quantity),
              name,
            })}
          </Text>
        );
      })}
    </View>
  );
}
const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingVertical: spacing.md },
  body: { fontSize: typography.body },
  title: { fontSize: typography.heading, fontWeight: '600' },
  order: { borderTopWidth: 1, paddingTop: spacing.lg, gap: spacing.sm },
});
