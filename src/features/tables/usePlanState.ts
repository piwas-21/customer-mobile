import usePlanResource from './usePlanResource';
import usePrivateTableState from './usePrivateTableState';
import type { TablePlanController } from '../../core/tablePlanController';
import type { TablePlanView } from '../../core/tablePlanView';
import type { TablePlanChoice } from '../../domain/tablePlanSelection';
export default function usePlanState() {
  const state = usePrivateTableState<TablePlanView, TablePlanController>(usePlanResource());
  const { run, locale } = state;
  return {
    ...state,
    prepare: (choice: TablePlanChoice) => run((actor) => actor.prepare(choice, locale), false),
    confirm: (id: string) => run((actor) => actor.confirm(id, locale)),
    check: () => run((actor) => actor.recover(locale)),
    stop: (id: string) => run((actor) => actor.stop(id, locale)),
    acknowledge: (id: string) => run((actor) => actor.acknowledge(id)),
  };
}
