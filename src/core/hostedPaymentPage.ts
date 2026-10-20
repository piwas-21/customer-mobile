import { originSchema } from './directory';
const MAX_HOSTED_URL_LENGTH = 8192;
export function hostedPaymentPage(
  value: string,
  expiresAt: string,
  approvedOrigins: readonly string[],
  now = Date.now(),
): string {
  if (
    value.length > MAX_HOSTED_URL_LENGTH ||
    /[\u0000-\u0020\u007f\\]/.test(value) ||
    !Number.isFinite(Date.parse(expiresAt)) ||
    Date.parse(expiresAt) <= now
  )
    throw new Error('Hosted payment page unavailable');
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.hash ||
    url.port ||
    !approvedOrigins.some((origin) => originSchema.parse(origin) === url.origin)
  )
    throw new Error('Unapproved hosted payment page');
  return url.toString();
}
