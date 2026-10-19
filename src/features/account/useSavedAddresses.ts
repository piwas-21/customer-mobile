import { readCustomerAddresses } from '../../api/customerAddresses';
import type { SessionController } from '../../core/sessionController';
import type { TenantContext } from '../../core/tenantContext';
import usePrivatePages from '../../core/usePrivatePages';
export default function useSavedAddresses(
  context: TenantContext,
  controller: SessionController,
  userId: string,
  ownerVersion: string,
) {
  const page = usePrivatePages(
    context,
    userId,
    ownerVersion,
    'saved-addresses',
    (cursor?: string) => readCustomerAddresses(controller, userId, cursor),
    (data) => data.nextAfterId,
  );
  return { ...page, items: page.data?.items ?? [] };
}
