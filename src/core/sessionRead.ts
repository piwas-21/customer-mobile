import type { z } from 'zod';
import type { TenantContext } from './tenantContext';
import { ApiFailure, type CustomerTransport } from './transport';
export function readSession<T>(
  client: CustomerTransport,
  context: TenantContext,
  userId: string,
  path: string,
  schema: z.ZodType<T>,
  assertCurrent: () => void,
): Promise<T> {
  return client.request(context, path, schema, {
    credentials: 'customer',
    principal: { kind: 'customer', id: userId },
    assertCurrent,
  });
}

export async function retryAuthenticatedRead<T>(
  read: () => Promise<T>,
  refresh: () => Promise<void>,
  assertCurrent: () => void,
): Promise<T> {
  let result: T;
  try {
    result = await read();
  } catch (error) {
    if (!(error instanceof ApiFailure) || error.status !== 401 || error.reason !== 'http')
      throw error;
    assertCurrent();
    await refresh();
    assertCurrent();
    result = await read();
  }
  assertCurrent();
  return result;
}

export async function writeSession<T>(
  client: CustomerTransport,
  context: TenantContext,
  input: { userId: string; path: string; body: unknown; schema: z.ZodType<T>; locale: string },
  assertCurrent: () => void,
): Promise<T> {
  const result = await client.request(context, input.path, input.schema, {
    method: 'PUT',
    body: input.body,
    credentials: 'customer',
    principal: { kind: 'customer', id: input.userId },
    assertCurrent,
    locale: input.locale,
  });
  assertCurrent();
  return result;
}
