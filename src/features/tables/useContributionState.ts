import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ApiFailure } from '../../core/apiFailure';
import type { TableContributionController } from '../../core/tableContributionController';
import type { TableContributionChoice } from '../../domain/tableContributionSelection';
import useMounted from '../../core/useMounted';
import useContributionResource from './useContributionResource';
export default function useContributionState() {
  const { controller, key } = useContributionResource();
  const { i18n } = useTranslation();
  const cache = useQueryClient();
  const mounted = useMounted();
  const active = useRef<TableContributionController | undefined>(undefined);
  const [busy, setBusy] = useState<TableContributionController>();
  const [failed, setFailed] = useState<TableContributionController>();
  const query = useQuery({
    queryKey: key,
    queryFn: () => controller!.recover(i18n.language),
    enabled: Boolean(controller),
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  // Private financial state belongs only to this foreground controller resource.
  useEffect(
    () => () => {
      void cache.cancelQueries({ queryKey: key });
      cache.removeQueries({ queryKey: key });
    },
    [cache, key],
  );
  async function run<Result>(
    action: (actor: TableContributionController) => Promise<Result>,
    recover = true,
  ) {
    if (!controller || active.current || query.isFetching) throw new ApiFailure(409, 'refused');
    active.current = controller;
    setBusy(controller);
    setFailed(undefined);
    try {
      controller.assertCurrent();
      const result = await action(controller);
      controller.assertCurrent();
      return result;
    } catch (error) {
      try {
        controller.assertCurrent();
        if (mounted.current) setFailed(controller);
      } catch {
        /* Owner withdrawn. */
      }
      throw error;
    } finally {
      try {
        let saved;
        try {
          saved = recover ? await controller.recover(i18n.language) : await controller.saved();
        } catch {
          controller.assertCurrent();
          if (mounted.current) setFailed(controller);
          saved = await controller.saved();
        }
        controller.assertCurrent();
        cache.setQueryData(key, saved);
        void cache.invalidateQueries({
          queryKey: key.slice(0, 3),
          predicate: (q) =>
            ['basket', 'table-visit', 'unresolved-purchase', 'receipts'].includes(
              String(q.queryKey[3]),
            ),
        });
      } catch {
        /* Never publish after background, account or tenant withdrawal. */
      }
      if (active.current === controller) active.current = undefined;
      if (mounted.current) setBusy((owner) => (owner === controller ? undefined : owner));
    }
  }
  return {
    controller,
    value: controller && !query.isError ? query.data : undefined,
    loading: Boolean(controller && query.isPending),
    failed: Boolean(controller && (query.isError || failed === controller)),
    busy: Boolean(controller && (busy === controller || query.isFetching)),
    prepare: (choice: TableContributionChoice) =>
      run((actor) => actor.prepare(choice, i18n.language), false),
    confirm: (id: string) => run((actor) => actor.confirm(id, i18n.language)),
    check: () => run((actor) => actor.recover(i18n.language)),
    open: () => run((actor) => actor.open(i18n.language)),
    stop: (id: string) => run((actor) => actor.stop(id, i18n.language)),
    acknowledge: (id: string) => run((actor) => actor.acknowledge(id)),
  };
}
