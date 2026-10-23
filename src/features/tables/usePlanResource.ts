import { randomUUID } from 'expo-crypto';
import { TablePlanController } from '../../core/tablePlanController';
import { deviceSessions } from '../../storage/sessions';
import useTableOperationResource, { type TableOperationSource } from './useTableOperationResource';
const factory = (s: TableOperationSource) =>
  new TablePlanController(
    s.context,
    s.client,
    deviceSessions,
    s.sessions,
    s.principal,
    s.bootstrap,
    randomUUID,
  );
export default function usePlanResource() {
  return useTableOperationResource('table-plan', factory);
}
