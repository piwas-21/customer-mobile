import { canBrowse } from '../../core/capabilities';
import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { customerName } from '../../api/catalogue';
import Screen from '../../ui/Screen';
import Field from '../../ui/Field';
import Button from '../../ui/Button';
import Feedback from '../../ui/Feedback';
import { spacing, typography, useTheme } from '../../ui/theme';
import { useRestaurant } from '../restaurant/RestaurantProvider';
import ProductRow from './ProductRow';
import useMenu from './useMenu';
export default function MenuScreen() {
  const theme = useTheme();
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { context } = useRestaurant();
  const { menu: query, bootstrap } = useMenu();
  const [search, setSearch] = useState('');
  const products = useMemo(
    () =>
      query.data?.pages
        .flatMap((page) => page.items)
        .filter(
          (product, index, items) =>
            product.isActive &&
            !product.isComponent &&
            items.findIndex((item) => item.id === product.id) === index &&
            customerName(product, i18n.language)
              .toLocaleLowerCase()
              .includes(search.trim().toLocaleLowerCase()),
        ) ?? [],
    [query.data, search, i18n.language],
  );
  if (!context)
    return (
      <Screen>
        <Feedback message={t('chooseRestaurant')} />
        <Button label={t('switchRestaurant')} onPress={() => router.replace('/')} />
      </Screen>
    );
  if (!canBrowse(bootstrap.data))
    return (
      <Screen>
        <Feedback
          loading={bootstrap.isPending}
          message={bootstrap.isPending ? t('loading') : t('menuUnavailable')}
          retry={() => {
            void bootstrap.refetch();
          }}
        />
      </Screen>
    );
  return (
    <Screen>
      <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
        {context.tenant.name}
      </Text>
      <Button secondary label={t('switchRestaurant')} onPress={() => router.push('/')} />
      <Field
        label={t('searchMenu')}
        value={search}
        onChangeText={setSearch}
        returnKeyType="search"
      />
      <FlatList
        data={products}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={5}
        refreshing={query.isRefetching}
        onRefresh={() => {
          void query.refetch();
        }}
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
        }}
        renderItem={({ item }) => (
          <ProductRow
            context={context}
            currency={bootstrap.data?.currency ?? null}
            product={item}
            onPress={() => router.push({ pathname: '/product/[id]', params: { id: item.id } })}
          />
        )}
        ListEmptyComponent={
          <Feedback
            loading={query.isPending}
            message={
              query.isError ? t('menuUnavailable') : query.isPending ? t('loading') : t('emptyMenu')
            }
            retry={
              query.isError
                ? () => {
                    void query.refetch();
                  }
                : undefined
            }
          />
        }
      />
    </Screen>
  );
}
const styles = StyleSheet.create({
  title: { fontSize: typography.heading, fontWeight: '700', paddingTop: spacing.md },
  list: { gap: spacing.md, paddingBottom: spacing.xl },
});
