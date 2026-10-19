import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { OrderReceiptController } from '../../core/orderReceiptController';
import { deviceSessions } from '../../storage/sessions';
import { useSession } from '../account/SessionProvider';
import { useRestaurant } from '../restaurant/RestaurantProvider';
let version = 0;
export default function useOrderReceipts() {
  const session = useSession();
  const { context, client } = useRestaurant();
  const { i18n } = useTranslation();
  const cache = useQueryClient();
  const [focused, setFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  const scope = useMemo(
    () => ({
      context,
      client,
      sessions: session.controller,
      userId: session.userId,
      revision: session.ownerVersion,
    }),
    [context, client, session.controller, session.userId, session.ownerVersion],
  );
  const key = useMemo(
    () =>
      [
        context?.environment,
        context?.tenant.id,
        scope.userId ? `customer:${scope.userId}` : 'guest:basket',
        'receipts',
        context?.generation,
        scope.revision,
      ] as const,
    [context, scope.userId, scope.revision],
  );
  const [resource, setResource] = useState<{
    scope: typeof scope;
    reader: OrderReceiptController;
    version: number;
  }>();
  useEffect(() => {
    if (!scope.context || !scope.client || !scope.sessions) return;
    let reader: OrderReceiptController;
    try {
      reader = new OrderReceiptController(
        scope.context,
        deviceSessions,
        scope.sessions,
        scope.userId ? { kind: 'customer', id: scope.userId } : { kind: 'guest', id: 'basket' },
      );
    } catch {
      return;
    }
    const currentVersion = ++version;
    let active = true;
    void reader
      .list()
      .catch(() => undefined)
      .then(() => {
        if (active) setResource({ scope, reader, version: currentVersion });
      });
    return () => {
      active = false;
      reader.dispose();
      void cache.cancelQueries({ queryKey: key });
      cache.removeQueries({ queryKey: key });
    };
  }, [scope, key, cache]);
  const current = resource?.scope === scope ? resource : undefined;
  const reader = current?.reader;
  const [selection, setSelection] = useState<{ reader: OrderReceiptController; id: string }>();
  const selected = selection?.reader === reader ? selection?.id : undefined;
  const revision = [...key, current?.version];
  const list = useQuery({
    queryKey: [...revision, 'list'],
    queryFn: () => reader!.list(),
    enabled: Boolean(reader && focused),
    retry: false,
    staleTime: 0,
  });
  const item = list.data?.items.find((value) => value.operationId === selected);
  const receipt = useQuery({
    queryKey: [...revision, 'receipt', selected, i18n.language],
    queryFn: () => reader!.read(selected!, i18n.language),
    enabled: Boolean(reader && focused && item?.outcome === 'Applied'),
    retry: false,
    staleTime: 0,
  });
  const active = useRef<OrderReceiptController | undefined>(undefined);
  const [busy, setBusy] = useState<OrderReceiptController>();
  const [failure, setFailure] = useState<OrderReceiptController>();
  async function action(run: (owner: OrderReceiptController) => Promise<void>) {
    if (!reader || active.current === reader) return;
    active.current = reader;
    setBusy(reader);
    setFailure(undefined);
    try {
      await run(reader);
      reader.assertCurrent();
      await cache.invalidateQueries({ queryKey: revision });
    } catch {
      try {
        reader.assertCurrent();
        setFailure(reader);
      } catch {
        /* Withdrawn owner. */
      }
    } finally {
      if (active.current === reader) active.current = undefined;
      setBusy((previous) => (previous === reader ? undefined : previous));
    }
  }
  return {
    session,
    reader,
    items: reader ? list.data?.items : undefined,
    loading: session.loading || Boolean(reader && list.isPending),
    failed: list.isError,
    busy: Boolean(reader && busy === reader),
    actionFailed: Boolean(reader && failure === reader),
    selected,
    item,
    receipt: item?.outcome === 'Applied' && !receipt.isError ? receipt.data : undefined,
    receiptLoading: item?.outcome === 'Applied' && receipt.isPending,
    receiptFailed: item?.outcome === 'Applied' && receipt.isError,
    select: (id: string) => {
      if (reader) setSelection({ reader, id });
    },
    close: () => setSelection(undefined),
    refresh: () => {
      void list.refetch();
    },
    refreshReceipt: () => {
      void receipt.refetch();
    },
    forget: () =>
      action(async (owner) => {
        if (!selected) return;
        await owner.forget(selected);
        await cache.cancelQueries({ queryKey: [...revision, 'receipt', selected] });
        owner.assertCurrent();
        cache.removeQueries({ queryKey: [...revision, 'receipt', selected] });
        setSelection(undefined);
      }),
    canContinueAsGuest: list.data?.canContinueAsGuest === true,
    continueAsGuest: () => action((owner) => owner.continueAsGuest()),
  };
}
