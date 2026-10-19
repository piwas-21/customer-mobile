import { FlatList, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { SessionController } from '../../core/sessionController';
import type { TenantContext } from '../../core/tenantContext';
import BaseModal from '../../ui/BaseModal';
import Button from '../../ui/Button';
import Feedback from '../../ui/Feedback';
import { spacing } from '../../ui/theme';
import SavedAddressRow from './SavedAddressRow';
import useSavedAddresses from './useSavedAddresses';
type Props = Readonly<{
  context: TenantContext;
  controller: SessionController;
  userId: string;
  ownerVersion: string;
  onClose: () => void;
}>;
export default function SavedAddressesModal({
  context,
  controller,
  userId,
  ownerVersion,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const addresses = useSavedAddresses(context, controller, userId, ownerVersion);
  const emptyMessage = t(addresses.failed ? 'savedAddressesUnavailable' : 'noSavedAddresses');
  return (
    <BaseModal title={t('savedAddresses')} onClose={onClose} scroll={false}>
      <FlatList
        data={addresses.items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <SavedAddressRow address={item} />}
        ListEmptyComponent={
          addresses.loading ? (
            <Feedback message={t('loading')} loading />
          ) : (
            <Feedback message={emptyMessage} />
          )
        }
        ListFooterComponent={
          <View style={styles.actions}>
            <Button
              label={t('refreshAddresses')}
              secondary
              disabled={addresses.loading}
              onPress={addresses.refresh}
            />
            {addresses.hasPrevious ? (
              <Button
                label={t('previousAddresses')}
                secondary
                disabled={addresses.loading}
                onPress={addresses.previous}
              />
            ) : null}
            {addresses.hasNext ? (
              <Button
                label={t('nextAddresses')}
                secondary
                disabled={addresses.loading}
                onPress={addresses.next}
              />
            ) : null}
          </View>
        }
      />
      <Button label={t('close')} secondary onPress={onClose} />
    </BaseModal>
  );
}

const styles = StyleSheet.create({ actions: { gap: spacing.sm } });
