import { useMemo } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { CustomerBasket } from '../../api/basketResponse';
import { useBasket } from './BasketProvider';
import { basketRows, type BasketRow } from './basketRows';
import useBootstrap from '../restaurant/useBootstrap';
import Screen from '../../ui/Screen';
import Button from '../../ui/Button';
import Feedback from '../../ui/Feedback';
import { spacing, typography, useTheme } from '../../ui/theme';
export default function BasketScreen() {
  const basket = useBasket();
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const bootstrap = useBootstrap();
  const rows = useMemo(() => {
    try {
      return basketRows(basket.basket?.items ?? []);
    } catch {
      return null;
    }
  }, [basket.basket]);
  const currency = bootstrap.data?.currency;
  const price = (amount: number) =>
    currency
      ? new Intl.NumberFormat(i18n.language, { style: 'currency', currency }).format(amount)
      : t('priceUnavailable');
  const value = basket.basket;
  return (
    <Screen bottom top={false}>
      <Stack.Screen options={{ title: t('basket') }} />
      {basket.hasPending ? (
        <View style={styles.notice}>
          <Text accessibilityRole="alert" style={[styles.body, { color: theme.secondary }]}>
            {t('basketPending')}
          </Text>
          <Button
            label={t('recoverBasket')}
            busy={basket.busy}
            onPress={() => {
              void basket.recover().catch(() => undefined);
            }}
          />
        </View>
      ) : null}
      {basket.failed || !rows ? (
        <Feedback
          message={t('basketUnavailable')}
          retry={() => {
            void basket.refresh();
          }}
        />
      ) : null}
      {!basket.failed && rows ? (
        <FlatList
          data={rows}
          keyExtractor={({ key }) => key}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Feedback
              loading={basket.loading}
              message={t(basket.loading ? 'loading' : 'basketEmpty')}
            />
          }
          renderItem={({ item }) => <Line row={item} price={price} />}
          ListFooterComponent={value && rows.length ? <Totals value={value} price={price} /> : null}
        />
      ) : (
        <View style={styles.fill} />
      )}
      {basket.unavailable ? <Text style={{ color: theme.secondary }}>{t('webHelp')}</Text> : null}
      <Button
        secondary
        label={t('backToMenu')}
        disabled={basket.busy}
        onPress={() => router.replace('/menu')}
      />
    </Screen>
  );
}
function Line({ row, price }: Readonly<{ row: BasketRow; price: (amount: number) => string }>) {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <View style={[styles.line, row.nested && styles.nested, { borderColor: theme.border }]}>
      <Text style={[styles.body, { color: theme.text }]}>
        {t('selectedQuantity', { name: row.name ?? t('itemDetails'), quantity: row.quantity })}
      </Text>
      {row.amount !== null ? (
        <Text style={[styles.body, { color: theme.text }]}>{price(row.amount)}</Text>
      ) : null}
      {stableNames(row.description).map(({ name: detail, key }) => (
        <Text key={key} style={[styles.hint, { color: theme.secondary }]}>
          {detail}
        </Text>
      ))}
      {stableNames(row.removed).map(({ name, key }) => (
        <Text key={key} style={[styles.hint, { color: theme.secondary }]}>
          {t('withoutIngredient', { name })}
        </Text>
      ))}
      {row.instructions ? (
        <Text style={[styles.hint, { color: theme.secondary }]}>{row.instructions}</Text>
      ) : null}
    </View>
  );
}
function stableNames(names: readonly string[]) {
  const counts = new Map<string, number>();
  return names.map((name) => {
    const occurrence = counts.get(name) ?? 0;
    counts.set(name, occurrence + 1);
    return { name, key: JSON.stringify([name, occurrence]) };
  });
}
function Totals({
  value,
  price,
}: Readonly<{ value: CustomerBasket; price: (amount: number) => string }>) {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <View style={styles.totals}>
      <Text style={[styles.hint, { color: theme.secondary }]}>{t('serverPricedBasket')}</Text>
      <Text style={[styles.body, { color: theme.text }]}>
        {t('subtotal')}: {price(value.subTotal)}
      </Text>
      {value.deliveryFee > 0 ? (
        <Text style={[styles.body, { color: theme.text }]}>
          {t('deliveryFee')}: {price(value.deliveryFee)}
        </Text>
      ) : null}
      {value.discount + value.customerDiscount > 0 ? (
        <Text style={[styles.body, { color: theme.text }]}>
          {t('discount')}: {price(value.discount + value.customerDiscount)}
        </Text>
      ) : null}
      <Text style={[styles.total, { color: theme.text }]}>
        {t('total')}: {price(value.total)}
      </Text>
      <Text style={[styles.body, { color: theme.secondary }]}>{t('checkoutPreparing')}</Text>
    </View>
  );
}
const styles = StyleSheet.create({
  body: { fontSize: typography.body },
  hint: { fontSize: typography.small },
  list: { gap: spacing.md, paddingVertical: spacing.md },
  line: { gap: spacing.sm, paddingVertical: spacing.md, borderBottomWidth: 1 },
  nested: { paddingStart: spacing.lg },
  notice: { gap: spacing.md },
  totals: { gap: spacing.md, paddingVertical: spacing.lg },
  total: { fontSize: typography.heading, fontWeight: '700' },
  fill: { flex: 1 },
});
