import { useState } from 'react';
import type { CustomerAddress } from '../../api/customerAddresses';
import AddressEditor from './AddressEditor';
import AddressActionConfirmation from './AddressActionConfirmation';
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
  onSelect?: (address: CustomerAddress) => void;
}>;
type AddressView =
  { kind: 'create' } | { kind: 'edit' | 'remove' | 'default'; address: CustomerAddress };
export default function SavedAddressesModal({
  context,
  controller,
  userId,
  ownerVersion,
  onClose,
  onSelect,
}: Props) {
  const { t } = useTranslation();
  const addresses = useSavedAddresses(context, controller, userId, ownerVersion);
  const [view, setView] = useState<AddressView>();
  const [saved, setSaved] = useState(false);
  function back() {
    setView(undefined);
    addresses.refresh();
  }
  function complete() {
    setSaved(true);
    back();
  }
  const open = (view: AddressView) => {
    setSaved(false);
    setView(view);
  };
  if (view?.kind === 'create' || view?.kind === 'edit')
    return (
      <AddressEditor
        controller={controller}
        userId={userId}
        {...(view.kind === 'edit' ? { address: view.address } : {})}
        onSaved={complete}
        onCancel={back}
      />
    );
  if (view)
    return (
      <AddressActionConfirmation
        controller={controller}
        userId={userId}
        address={view.address}
        action={view.kind}
        onSaved={complete}
        onCancel={back}
      />
    );

  const emptyMessage = t(addresses.failed ? 'savedAddressesUnavailable' : 'noSavedAddresses');
  return (
    <BaseModal title={t('savedAddresses')} onClose={onClose} scroll={false}>
      <FlatList
        data={addresses.items}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={styles.actions}>
            {saved ? <Feedback message={t('addressSaved')} /> : null}
            {!onSelect ? (
              <Button
                label={t('addAddress')}
                disabled={addresses.loading || addresses.failed}
                onPress={() => open({ kind: 'create' })}
              />
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.actions}>
            <SavedAddressRow address={item} />
            {onSelect ? (
              <Button
                label={t('useSavedAddress', { label: item.label })}
                onPress={() => onSelect(item)}
              />
            ) : (
              <>
                <Button
                  label={t('editSavedAddress', { label: item.label })}
                  secondary
                  onPress={() => open({ kind: 'edit', address: item })}
                />
                {!item.isDefault ? (
                  <Button
                    label={t('setSavedAddressDefault', { label: item.label })}
                    secondary
                    onPress={() => open({ kind: 'default', address: item })}
                  />
                ) : null}
                <Button
                  label={t('removeSavedAddress', { label: item.label })}
                  destructive
                  secondary
                  onPress={() => open({ kind: 'remove', address: item })}
                />
              </>
            )}
          </View>
        )}
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
