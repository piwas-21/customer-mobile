import { randomUUID } from 'expo-crypto';
import { openBrowserAsync } from 'expo-web-browser';
import { TableContributionController } from '../../core/tableContributionController';
import { deviceSessions } from '../../storage/sessions';
import { runtimeConfig } from '../../config';
import useTableOperationResource, { type TableOperationSource } from './useTableOperationResource';
const factory = (s: TableOperationSource) =>
  new TableContributionController(
    s.context,
    s.client,
    deviceSessions,
    s.sessions,
    s.principal,
    s.bootstrap,
    randomUUID,
    runtimeConfig?.hostedCheckoutOrigins ?? [],
    openBrowserAsync,
  );
export default function useContributionResource() {
  return useTableOperationResource('table-contribution', factory);
}
