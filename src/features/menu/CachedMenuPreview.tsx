import { useMemo, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { PublicMenuSnapshot } from '../../domain/publicMenuSnapshot';
import BaseModal from '../../ui/BaseModal';
import Button from '../../ui/Button';
import Feedback from '../../ui/Feedback';
import Field from '../../ui/Field';
import { useTheme } from '../../ui/theme';
import { listSummaryStyles as styles } from '../../ui/listSummaryStyles';
export default function CachedMenuPreview({
  snapshot,
  onBack,
  onClose,
}: Readonly<{
  snapshot: PublicMenuSnapshot;
  onBack: () => void;
  onClose: () => void;
}>) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const [search, setSearch] = useState('');
  const items = useMemo(
    () =>
      snapshot.items.filter((item) =>
        item.name
          .toLocaleLowerCase(i18n.language)
          .includes(search.trim().toLocaleLowerCase(i18n.language)),
      ),
    [snapshot, search, i18n.language],
  );
  const captured = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(snapshot.capturedAt));
  return (
    <BaseModal title={snapshot.restaurantName} onClose={onClose} scroll={false}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={5}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListHeaderComponent={
          <View style={styles.content}>
            <Feedback message={t('cachedMenuWarning')} />
            <Feedback message={t('cachedMenuDate', { date: captured, locale: snapshot.locale })} />
            {snapshot.incomplete ? <Feedback message={t('cachedMenuIncomplete')} /> : null}
            <Field
              label={t('searchMenu')}
              value={search}
              onChangeText={setSearch}
              returnKeyType="search"
            />
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.row, { borderColor: theme.border }]}>
            <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
              {item.name}
            </Text>
            {item.description ? (
              <Text style={[styles.body, { color: theme.secondary }]}>{item.description}</Text>
            ) : null}
            <Text style={[styles.body, { color: theme.text }]}>
              {t('cachedMenuPriceUnavailable')}
            </Text>
            {item.allergens.length ? (
              <Text style={[styles.body, { color: theme.secondary }]}>
                {t('cachedMenuAllergens', { allergens: item.allergens.join(', ') })}
              </Text>
            ) : null}
          </View>
        )}
        ListEmptyComponent={<Feedback message={t('emptyMenu')} />}
        ListFooterComponent={<Button label={t('backToSavedMenus')} secondary onPress={onBack} />}
      />
      <Button label={t('close')} secondary onPress={onClose} />
    </BaseModal>
  );
}
