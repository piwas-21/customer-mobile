import { tableQrSchema } from '../api/tableVisitContract';
import { originSchema, resolveTenant, type Directory } from './directory';
import { resolveLink, type AppDestination } from './links';
// Existing printed table codes use the restaurant web /scan?qr=... contract.
// Resolve that origin exclusively through the current directory; never fetch a scanned URL.
export function resolveScanEntry(
  value: string,
  linkOrigin: string,
  directory: Directory,
): AppDestination {
  originSchema.parse(linkOrigin);
  const url = new URL(value);
  if (url.origin === linkOrigin) return resolveLink(value, linkOrigin, directory);
  if (
    url.username ||
    url.password ||
    url.hash ||
    url.pathname !== '/scan' ||
    [...url.searchParams.keys()].some((key) => key !== 'qr') ||
    url.searchParams.getAll('qr').length !== 1
  )
    throw new Error('Untrusted table QR');
  const matches = directory.tenants.filter((tenant) => tenant.webOrigin === url.origin);
  if (matches.length !== 1) throw new Error('Unknown or ambiguous restaurant');
  const tenant = resolveTenant(directory, matches[0]!.id);
  return {
    tenantId: tenant.id,
    destination: 'table',
    reference: tableQrSchema.parse(url.searchParams.get('qr')),
  };
}
