import { useEffect, useState } from 'react';
import { AppState, FlatList, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { Directory, Environment } from '../../core/directory';
import { snapshotIdentity, PUBLIC_MENU_MAX_AGE_MS } from '../../domain/publicMenuSnapshot';
import { readPublicMenus, removePublicMenu } from '../../storage/publicMenuCache';
import BaseModal from '../../ui/BaseModal';
import Button from '../../ui/Button';
import Feedback from '../../ui/Feedback';
import CachedMenuPreview from './CachedMenuPreview';
export default function SavedMenusModal({
  environment,
  directory,
  onClose,
}: Readonly<{
  environment: Environment;
  directory: Directory | undefined;
  onClose: () => void;
}>) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string>();
  const [removal, setRemoval] = useState<'busy' | 'failed'>();
  const query = useQuery({
    queryKey: ['public', environment, 'saved-menu-previews'],
    queryFn: () => readPublicMenus(environment),
    retry: false,
    gcTime: 0,
    staleTime: 0,
  });
  const refresh = query.refetch;
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => subscription.remove();
  }, [refresh]);
  useEffect(() => {
    const expires =
      query.data?.reduce(
        (next, snapshot) =>
          Math.min(next, Date.parse(snapshot.capturedAt) + PUBLIC_MENU_MAX_AGE_MS),
        Infinity,
      ) ?? Infinity;
    if (!Number.isFinite(expires)) return;
    const timer = setTimeout(
      () => {
        void refresh();
      },
      Math.max(1, expires - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [query.data, refresh]);
  const busy = query.isFetching || query.isPending;
  const snapshots =
    !busy && !query.isError
      ? (query.data ?? []).filter(
          (snapshot) =>
            !directory ||
            directory.tenants.some(
              (tenant) =>
                tenant.id === snapshot.tenantId &&
                tenant.status !== 'disabled' &&
                tenant.contractVersions.includes(1),
            ),
        )
      : [];
  const current = snapshots.find((snapshot) => snapshotIdentity(snapshot) === selected);
  if (current)
    return (
      <CachedMenuPreview
        snapshot={current}
        onBack={() => setSelected(undefined)}
        onClose={onClose}
      />
    );
  let message = 'noSavedMenus';
  if (busy) message = 'loading';
  else if (query.isError) message = 'savedMenusUnavailable';
  return (
    <BaseModal title={t('savedMenus')} onClose={onClose} scroll={false}>
      <FlatList
        data={snapshots}
        keyExtractor={snapshotIdentity}
        renderItem={({ item }) => (
          <View>
            <Button
              label={t('viewSavedMenu', { name: item.restaurantName, locale: item.locale })}
              secondary
              onPress={() => setSelected(snapshotIdentity(item))}
            />
            <Button
              label={t('removeSavedMenu', { name: item.restaurantName, locale: item.locale })}
              secondary
              disabled={removal === 'busy'}
              onPress={() => {
                setRemoval('busy');
                void removePublicMenu(environment, snapshotIdentity(item))
                  .then(() => refresh())
                  .then(() => setRemoval(undefined))
                  .catch(() => setRemoval('failed'));
              }}
            />
          </View>
        )}
        ListEmptyComponent={<Feedback message={t(message)} loading={busy} />}
        ListFooterComponent={
          <View>
            {removal === 'failed' ? <Feedback message={t('savedMenuRemovalFailed')} /> : null}
            <Button
              label={t('refreshSavedMenus')}
              secondary
              disabled={busy}
              onPress={() => {
                void refresh();
              }}
            />
          </View>
        }
      />
      <Button label={t('close')} secondary onPress={onClose} />
    </BaseModal>
  );
}
