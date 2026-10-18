import { fetch as expoFetch } from 'expo/fetch';
import { z } from 'zod';
import { originSchema } from './directory';
import type { CredentialVault, Principal } from './credentials';
import type { TenantBoundary, TenantContext } from './tenantContext';
export type Fetch = (
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    redirect?: 'error';
    credentials?: 'omit';
    signal?: AbortSignal;
    body?: string;
  },
) => Promise<Response>;
export class ApiFailure extends Error {
  constructor(
    readonly status: number,
    readonly reason: 'network' | 'http' | 'contract' | 'refused',
  ) {
    super(`Customer API ${reason}`);
  }
}
const envelopeSchema = z.object({
  success: z.boolean(),
  data: z.unknown().optional(),
  errors: z.array(z.string()).nullish(),
  message: z.string().nullish(),
});
export type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  credentials?: 'none' | 'customer' | 'guest' | 'table';
  principal?: Principal;
  locale?: string;
};
const REQUEST_TIMEOUT_MS = 15_000;
export function apiUrl(origin: string, path: string): string {
  originSchema.parse(origin);
  if (!path.startsWith('/api/') || /[\\#\r\n]/.test(path)) throw new Error('Invalid API path');
  const url = new URL(path, origin);
  if (url.origin !== origin || !url.pathname.startsWith('/api/'))
    throw new Error('Invalid API destination');
  return url.toString();
}
export class CustomerTransport {
  constructor(
    private readonly boundary: TenantBoundary,
    private readonly vault: CredentialVault,
    private readonly fetcher: Fetch = expoFetch,
  ) {}
  async request<T>(
    context: TenantContext,
    path: string,
    schema: z.ZodType<T>,
    options: RequestOptions = {},
  ): Promise<T> {
    this.boundary.assertCurrent(context);
    const method = options.method ?? 'GET';
    if (method !== 'GET' && context.tenant.status !== 'active')
      throw new Error('Restaurant is read-only');
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (options.locale) headers['Accept-Language'] = options.locale;
    const mode = options.credentials ?? 'none';
    const principal = options.principal ? Object.freeze({ ...options.principal }) : undefined;
    if (mode === 'customer') {
      if (principal?.kind !== 'customer') throw new ApiFailure(401, 'refused');
      const session = await this.vault.session(context, principal.id);
      if (!session) throw new ApiFailure(401, 'refused');
      headers.Authorization = `Bearer ${session.accessToken}`;
    }
    if (mode === 'guest' || mode === 'table') {
      if (principal?.kind !== 'guest') throw new ApiFailure(401, 'refused');
      const session = await this.vault.capability(context, 'guest-session', principal);
      if (!session) throw new ApiFailure(401, 'refused');
      headers['X-Session-Id'] = session;
    }
    if (mode === 'table') {
      if (principal?.kind !== 'guest') throw new ApiFailure(401, 'refused');
      const participant = await this.vault.capability(context, 'table-participant', principal);
      if (!participant) throw new ApiFailure(401, 'refused');
      headers['X-Table-Participant'] = participant;
    }
    this.boundary.assertCurrent(context);
    const controller = new AbortController();
    const cancel = () => controller.abort();
    context.signal.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(cancel, REQUEST_TIMEOUT_MS);
    try {
      const response = await this.fetcher(apiUrl(context.tenant.apiOrigin, path), {
        method,
        headers,
        redirect: 'error',
        credentials: 'omit',
        signal: controller.signal,
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      });
      this.boundary.assertCurrent(context);
      if (response.redirected) throw new ApiFailure(response.status, 'contract');
      if (!response.ok) throw new ApiFailure(response.status, 'http');
      if (!response.headers.get('content-type')?.includes('application/json'))
        throw new ApiFailure(response.status, 'contract');
      const parsed = envelopeSchema.safeParse(await response.json());
      if (!parsed.success) throw new ApiFailure(response.status, 'contract');
      if (!parsed.data.success) throw new ApiFailure(response.status, 'refused');
      const data = schema.safeParse(parsed.data.data);
      if (!data.success) throw new ApiFailure(response.status, 'contract');
      this.boundary.assertCurrent(context);
      return data.data;
    } catch (error) {
      if (error instanceof ApiFailure) throw error;
      throw new ApiFailure(0, 'network');
    } finally {
      clearTimeout(timer);
      context.signal.removeEventListener('abort', cancel);
    }
  }
}
export async function fetchDirectory(origin: string, fetcher: Fetch = expoFetch): Promise<unknown> {
  originSchema.parse(origin);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetcher(`${origin}/v1/directory`, {
      redirect: 'error',
      credentials: 'omit',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (
      response.redirected ||
      !response.ok ||
      !response.headers.get('content-type')?.includes('application/json')
    )
      throw new ApiFailure(response.status, 'http');
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}
