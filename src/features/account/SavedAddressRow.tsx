import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { CustomerAddress } from '../../api/customerAddresses';
import StatusBadge from '../../ui/StatusBadge';
import { spacing, typography, useTheme } from '../../ui/theme';
export default function SavedAddressRow({ address }: Readonly<{ address: CustomerAddress }>) {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <View style={[styles.row, { borderColor: theme.border }]}>
      <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
        {address.label}
      </Text>
      {address.isDefault ? <StatusBadge label={t('defaultAddress')} tone="positive" /> : null}
      {Object.entries({
        street: address.addressLine1,
        line2: address.addressLine2,
        locality: [address.postalCode, address.city].join(' '),
        state: address.state,
        country: address.country,
        phone: address.phone,
      })
        .filter(([, line]) => Boolean(line))
        .map(([key, line]) => (
          <Text selectable key={key} style={[styles.body, { color: theme.text }]}>
            {line}
          </Text>
        ))}
      {address.deliveryInstructions ? (
        <Text selectable style={[styles.body, { color: theme.secondary }]}>
          {t('savedDeliveryInstructions', { instructions: address.deliveryInstructions })}
        </Text>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  row: { gap: spacing.sm, paddingVertical: spacing.md, borderBottomWidth: 1 },
  title: { fontSize: typography.heading, fontWeight: '600' },
  body: { fontSize: typography.body, lineHeight: 26 },
});
