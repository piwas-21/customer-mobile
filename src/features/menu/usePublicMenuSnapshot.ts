import { useEffect } from 'react';
import type { Product } from '../../api/catalogue';
import { canBrowse, type Bootstrap } from '../../core/capabilities';
import type { TenantContext } from '../../core/tenantContext';
import { makePublicMenuSnapshot } from '../../domain/publicMenuSnapshot';
import { savePublicMenu } from '../../storage/publicMenuCache';
type Page = { items: readonly Product[]; page: number; totalPages: number; fetchedAt: number };
export default function usePublicMenuSnapshot(
  context: TenantContext | undefined,
  bootstrap: Bootstrap | undefined,
  locale: string,
  pages: readonly Page[] | undefined,
  ready: boolean,
) {
  useEffect(() => {
    if (
      !context ||
      !ready ||
      !canBrowse(bootstrap) ||
      bootstrap?.tenantId !== context.tenant.id ||
      !pages?.length
    )
      return;
    // Public display-only projection. Storage contains no origin, capability,
    // session or availability flag and can never restore a trusted context.
    void Promise.resolve()
      .then(() =>
        savePublicMenu(context.environment, makePublicMenuSnapshot(context, locale, pages)),
      )
      .catch(() => undefined);
  }, [context, bootstrap, locale, pages, ready]);
}
