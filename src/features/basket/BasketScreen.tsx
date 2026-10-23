import ContributionNotice from '../tables/ContributionNotice';
import RoundControl from '../tables/RoundControl';
import RoundAttemptNotice from '../tables/RoundAttemptNotice';
import CancellationNotice from '../orders/CancellationNotice';
import PaymentAttentionNotice from '../payments/PaymentAttentionNotice';
import { useMemo } from 'react';
import { FlatList, StyleSheet, Text } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useBasket } from './BasketProvider';
import { basketRows } from './basketRows';
import useBootstrap from '../restaurant/useBootstrap';
import BasketLine from './BasketLine';
import BasketTotals from './BasketTotals';
import BasketNotice from './BasketNotice';
import BasketChannelControl from './BasketChannelControl';
import BasketItemEditor from './BasketItemEditor';
import useBasketSelection from './useBasketSelection';
import CheckoutControl from './CheckoutControl';
import CustomerOrderNotice from './CustomerOrderNotice';
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
      <FlatList
        data={!basket.failed && rows ? rows : []}
        keyExtractor={({ key }) => key}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <>
            <RoundAttemptNotice />
            <ContributionNotice />
            <PaymentAttentionNotice />
            <CancellationNotice />
            <BasketNotice basket={basket} />
            <CustomerOrderNotice basket={basket} />
            <BasketChannelControl basket={basket} />
            {basket.failed || !rows ? (
              <Feedback message={t('basketUnavailable')} retry={() => void basket.refresh()} />
            ) : null}
          </>
        }
        ListEmptyComponent={
          !basket.failed && rows ? (
            <Feedback
              loading={basket.loading}
              message={t(basket.loading ? 'loading' : 'basketEmpty')}
            />
          ) : null
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
          !basket.failed && value && rows?.length ? (
            <BasketTotals value={value} price={price} />
          ) : null
        }
      />
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
      <RoundControl basket={basket} />
      <CheckoutControl basket={basket} currency={currency ?? undefined} />
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
});
