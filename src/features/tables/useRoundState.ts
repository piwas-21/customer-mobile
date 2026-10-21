import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { TableRoundController } from '../../core/tableRoundController';
import type { TableRoundView } from '../../core/tableRoundView';
import { ApiFailure } from '../../core/apiFailure';
import useMounted from '../../core/useMounted';
import useRoundResource from './useRoundResource';

type Snapshot = {
  controller: TableRoundController;
  value: TableRoundView | null | undefined;
  failed: boolean;
};
export default function useRoundState() {
  const { controller, scope } = useRoundResource();
  const { i18n } = useTranslation();
  const cache = useQueryClient();
  const mounted = useMounted();
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [busy, setBusy] = useState<TableRoundController>();
  const active = useRef<TableRoundController | undefined>(undefined);
  const revision = useRef(0);
  useEffect(() => {
    const version = ++revision.current;
    if (!controller) return;
    let current = true;
    void restoreSnapshot(controller)
      .then((value) => {
        if (current && mounted.current && version === revision.current) setSnapshot(value);
      })
      .catch(() => {
        /* Owner withdrawn. */
      });
    return () => {
      current = false;
    };
  }, [controller, mounted]);
  const run = useCallback(
    async function run<Result>(
      action: (actor: TableRoundController) => Promise<Result>,
      invalidate = false,
    ) {
      if (!controller || active.current === controller) throw new ApiFailure(409, 'refused');
      active.current = controller;
      revision.current++;
      setBusy(controller);
      let failed = false;
      try {
        controller.assertCurrent();
        return await action(controller);
      } catch (error) {
        failed = true;
        throw error;
      } finally {
        try {
          const value = await restoreSnapshot(controller, failed);
          controller.assertCurrent();
          if (mounted.current) setSnapshot(value);
          if (invalidate)
            void cache
              .resetQueries({
                queryKey: scope,
                predicate: (query) =>
                  ['basket', 'table-visit', 'order-history'].includes(String(query.queryKey[3])),
              })
              .catch(() => undefined);
        } catch {
          /* No late private state after withdrawal. */
        }
        if (active.current === controller) active.current = undefined;
        if (mounted.current) setBusy((owner) => (owner === controller ? undefined : owner));
        if (!failed) controller.assertCurrent();
      }
    },
    [controller, mounted, cache, scope],
  );
  const current = snapshot?.controller === controller ? snapshot : undefined;
  return {
    controller,
    value: controller ? current?.value : undefined,
    loading: Boolean(controller && !current),
    failed: Boolean(controller && current?.failed),
    busy: Boolean(controller && busy === controller),
    prepare: () => run((actor) => actor.prepare(i18n.language)),
    confirm: (id: string) => run((actor) => actor.confirm(id, i18n.language), true),
    check: () => run((actor) => actor.recover(i18n.language), true),
    cancelAttempt: (id: string) => run((actor) => actor.cancelAttempt(id, i18n.language), true),
    acknowledge: (id: string) => run((actor) => actor.acknowledge(id), true),
    restore: () => run((actor) => actor.saved()),
  };
}

async function restoreSnapshot(
  controller: TableRoundController,
  failed = false,
): Promise<Snapshot> {
  try {
    const value = await controller.saved();
    controller.assertCurrent();
    return { controller, value, failed };
  } catch {
    controller.assertCurrent();
    return { controller, value: undefined, failed: true };
  }
}
