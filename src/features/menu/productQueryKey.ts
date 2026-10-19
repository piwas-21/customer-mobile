import type { OrderType } from '../../api/productDetail';
import type { TenantContext } from '../../core/tenantContext';
export default function productQueryKey(
  context: TenantContext | undefined,
  id: string,
  locale: string,
  channel?: OrderType,
) {
  return [
    context?.environment,
    context?.tenant.id,
    'public',
    'product',
    id,
    locale,
    context?.generation,
    channel ?? 'unspecified',
  ] as const;
}
