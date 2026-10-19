import { useMemo } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useBasket } from './BasketProvider';
import { basketRows } from './basketRows';
import useBootstrap from '../restaurant/useBootstrap';
import BasketLine from './BasketLine';
import BasketTotals from './BasketTotals';
import BasketNotice from './BasketNotice';
import BasketItemEditor from './BasketItemEditor';
import useBasketSelection from './useBasketSelection';
import Screen from '../../ui/Screen';
import Button from '../../ui/Button';
import Feedback from '../../ui/Feedback';
import { spacing, useTheme } from '../../ui/theme';
export default function BasketScreen() {
  const basket = useBasket();
  return <BasketContent key={JSON.stringify(basket.revision)} basket={basket} />;
}
function BasketContent({ basket }: Readonly<{ basket: ReturnType<typeof useBasket> }>) {
  const selection = useBasketSelection(basket);
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
      <BasketNotice basket={basket} />
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
          renderItem={({ item }) => (
            <BasketLine
              row={item}
              price={price}
              edit={() => selection.edit(item)}
              disabled={!basket.canAdd}
            />
          )}
          ListFooterComponent={
            value && rows.length ? <BasketTotals value={value} price={price} /> : null
          }
        />
      ) : (
        <View style={styles.fill} />
      )}
      {selection.current ? (
        <BasketItemEditor
          selection={selection.current}
          ready={basket.canAdd}
          changed={selection.changed}
          mutate={basket.mutate}
          onClose={selection.close}
        />
      ) : null}
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
const styles = StyleSheet.create({
  list: { gap: spacing.md, paddingVertical: spacing.md },
  fill: { flex: 1 },
});
