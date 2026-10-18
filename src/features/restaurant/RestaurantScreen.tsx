import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import Screen from '../../ui/Screen';
import Button from '../../ui/Button';
import Field from '../../ui/Field';
import Feedback from '../../ui/Feedback';
import { spacing, typography, useTheme } from '../../ui/theme';
import { useRestaurant } from './RestaurantProvider';
export default function RestaurantScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const { directory, loading, select, refresh } = useRestaurant();
  const [search, setSearch] = useState('');
  const tenants = useMemo(
    () =>
      directory?.tenants.filter(
        (tenant) =>
          tenant.status !== 'disabled' &&
          tenant.contractVersions.includes(1) &&
          tenant.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
      ) ?? [],
    [directory, search],
  );
  return (
    <Screen>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={[styles.brand, { color: theme.accent }]}>
          {t('appName')}
        </Text>
        <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
          {t('chooseRestaurant')}
        </Text>
        <Text style={[styles.intro, { color: theme.secondary }]}>{t('restaurantIntro')}</Text>
      </View>
      <Field
        label={t('searchRestaurants')}
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
        returnKeyType="search"
      />
      <FlatList
        data={tenants}
        keyExtractor={(tenant) => tenant.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Button
            secondary
            label={item.name}
            onPress={() => {
              if (select(item.id)) router.replace('/menu');
            }}
          />
        )}
        ListEmptyComponent={
          <Feedback
            loading={loading}
            message={loading ? t('loading') : directory ? t('noRestaurants') : t('unavailable')}
            retry={directory ? undefined : refresh}
          />
        }
      />
      <Button secondary label={t('scanQr')} onPress={() => router.push('/scan')} />
    </Screen>
  );
}
const styles = StyleSheet.create({
  header: { gap: spacing.sm, paddingTop: spacing.xl },
  brand: { fontSize: typography.heading, fontWeight: '700' },
  title: { fontSize: typography.title, fontWeight: '700' },
  intro: { fontSize: typography.body, lineHeight: 26 },
  list: { gap: spacing.md, paddingVertical: spacing.md },
});
