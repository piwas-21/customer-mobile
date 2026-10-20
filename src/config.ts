import { hostedCheckoutOrigins } from './core/hostedCheckoutConfig';
import { z } from 'zod';
import { environmentSchema, originSchema } from './core/directory';
const configSchema = z.object({
  environment: environmentSchema,
  directoryOrigin: originSchema,
  linkOrigin: originSchema,
});
const parsed = configSchema.safeParse({
  environment: process.env.EXPO_PUBLIC_ENVIRONMENT,
  directoryOrigin: process.env.EXPO_PUBLIC_MOBILE_DIRECTORY_ORIGIN,
  linkOrigin: process.env.EXPO_PUBLIC_MOBILE_LINK_ORIGIN,
});
// Invalid payment configuration disables opening while retaining browsing and reconciliation.
let approvedHostedOrigins: readonly string[] = [];
try {
  approvedHostedOrigins = hostedCheckoutOrigins(process.env.EXPO_PUBLIC_HOSTED_CHECKOUT_ORIGINS);
} catch {
  /* No approved payment destination. */
}
export const runtimeConfig = parsed.success
  ? { ...parsed.data, hostedCheckoutOrigins: approvedHostedOrigins }
  : undefined;
