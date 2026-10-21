import {
  bindPreparedTableRound,
  bindTableRoundResolution,
  tableRoundPreparedSchema,
  tableRoundResolutionSchema,
} from './tableRoundContract';
import { scopedRoundPreparation, type TableRoundPreparation } from '../core/tableRoundPreparation';
import { scopedTableRound, type TableRoundRecord } from '../core/tableRoundRecord';
import { tableRoundPath } from '../core/tableRoundRequest';
import { refreshCredentialsSchema } from '../core/refreshCredentials';
import { ApiFailure, type CustomerTransport } from '../core/transport';
import type { TenantContext } from '../core/tenantContext';
import type { CustomerSession } from '../core/credentials';
import { customerAuthResponseSchema } from './customerAuthResponse';

export async function prepareTableRound(
  client: CustomerTransport,
  context: TenantContext,
  input: TableRoundPreparation,
  guard: () => void,
  locale: string,
) {
  const preparation = scopedRoundPreparation(context, input.principal, input);
  guard();
  const result = await client.request(
    context,
    tableRoundPath + '/prepare',
    tableRoundPreparedSchema,
    {
      method: 'POST',
      credentials: 'table-round-prepare',
      principal: preparation.principal,
      expectedRoundPreparation: preparation,
      body: preparation.intent,
      assertCurrent: guard,
      locale,
    },
  );
  guard();
  return bindPreparedTableRound(preparation.intent, preparation.currency, result);
}
export async function resolveTableRound(
  client: CustomerTransport,
  context: TenantContext,
  input: TableRoundRecord,
  action:
    | { phase: 'submit'; preparation: TableRoundPreparation }
    | { phase: 'recover' | 'cancel-attempt' },
  guard: () => void,
  locale: string,
) {
  const record = scopedTableRound(context, input.principal, input);
  guard();
  const result = await client.request(
    context,
    tableRoundPath + '/' + action.phase,
    tableRoundResolutionSchema,
    {
      method: 'POST',
      credentials: 'table-round-operation',
      principal: record.principal,
      expectedRoundRecord: record,
      ...('preparation' in action ? { expectedRoundPreparation: action.preparation } : {}),
      body:
        action.phase === 'submit'
          ? {
              ...record.intent,
              payloadHash: record.proof.payloadHash,
              ownerProof: record.proof.ownerProof,
            }
          : record.proof,
      assertCurrent: guard,
      locale,
    },
  );
  guard();
  return bindTableRoundResolution(record.intent, result, action.phase);
}
export async function refreshTableRoundSession(
  client: CustomerTransport,
  context: TenantContext,
  session: CustomerSession,
  guard: () => void,
  input: TableRoundRecord,
) {
  const record = scopedTableRound(context, input.principal, input);
  if (record.principal.kind !== 'customer' || record.principal.id !== session.userId)
    throw new ApiFailure(401, 'refused');
  const result = await client.request(
    context,
    '/api/Auth/refresh-token',
    customerAuthResponseSchema,
    {
      method: 'POST',
      credentials: 'table-round-renewal',
      principal: record.principal,
      expectedRoundRecord: record,
      body: refreshCredentialsSchema.parse({
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
      }),
      assertCurrent: guard,
    },
  );
  if (result.userId !== record.principal.id) throw new ApiFailure(401, 'refused');
  return {
    userId: result.userId,
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
  };
}
