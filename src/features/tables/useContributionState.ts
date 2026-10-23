import useContributionResource from './useContributionResource';
import usePrivateTableState from './usePrivateTableState';
import type { TableContributionController } from '../../core/tableContributionController';
import type { TableContributionView } from '../../core/tableContributionView';
import type { TableContributionChoice } from '../../domain/tableContributionSelection';
export default function useContributionState() {
  const state = usePrivateTableState<TableContributionView, TableContributionController>(
    useContributionResource(),
  );
  const { run, locale } = state;
  return {
    ...state,
    prepare: (choice: TableContributionChoice) =>
      run((actor) => actor.prepare(choice, locale), false),
    confirm: (id: string) => run((actor) => actor.confirm(id, locale)),
    check: () => run((actor) => actor.recover(locale)),
    open: () => run((actor) => actor.open(locale)),
    stop: (id: string) => run((actor) => actor.stop(id, locale)),
    acknowledge: (id: string) => run((actor) => actor.acknowledge(id)),
  };
}
