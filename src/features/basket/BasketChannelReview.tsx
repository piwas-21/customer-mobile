import type { ReactNode } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { BasketChannelPreview } from '../../api/basketChannelPreview';
import Button from '../../ui/Button';
import Feedback from '../../ui/Feedback';
import { spacing, typography, useTheme } from '../../ui/theme';
export default function BasketChannelReview({
  preview,
  failure,
  ready,
  changed,
  busy,
  confirm,
  back,
}: Readonly<{
  preview: BasketChannelPreview;
  failure: ReactNode;
  ready: boolean;
  changed: boolean;
  busy: boolean;
  confirm: () => void;
  back: () => void;
}>) {
  const { t } = useTranslation();
  const theme = useTheme();
  const removes = preview.conflicts.length > 0;
  return (
    <FlatList
      style={styles.fill}
      data={preview.conflicts}
      keyExtractor={(row) => row.basketItemId}
      contentContainerStyle={styles.rows}
      ListHeaderComponent={
        <View style={styles.section}>
          {failure}
          <Text style={[styles.body, { color: theme.text }]}>
            {t(removes ? 'channelRemoveExplanation' : 'channelKeepExplanation', {
              type: t(`orderType${preview.orderType}`),
            })}
          </Text>
          {changed ? <Feedback message={t('channelReviewChanged')} /> : null}
        </View>
      }
      renderItem={({ item }) => (
        <Text style={[styles.body, { color: theme.text }]}>
          {t('selectedQuantity', { name: item.productName, quantity: item.quantity })}
        </Text>
      )}
      ListFooterComponent={
        <View style={styles.section}>
          <Button
            destructive={removes}
            label={t(removes ? 'confirmChannelRemovals' : 'confirmChannel', {
              type: t(`orderType${preview.orderType}`),
            })}
            disabled={!ready || changed}
            busy={busy}
            onPress={confirm}
          />
          <Button secondary label={t('back')} disabled={busy} onPress={back} />
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  section: { gap: spacing.md },
  body: { fontSize: typography.body },
  rows: { gap: spacing.md, paddingBottom: spacing.md },
});
