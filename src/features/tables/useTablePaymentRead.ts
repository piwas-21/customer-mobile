import { useLayoutEffect, useState } from 'react';
import type { TablePaymentAccount } from '../../api/tablePaymentAccountContract';
import { ApiFailure } from '../../core/apiFailure';

export type TablePaymentViewScope = Readonly<{
  read: (guard: () => void) => Promise<TablePaymentAccount>;
  visit: string;
  revision: number;
  currency: string;
}>;
export default function useTablePaymentRead(scope: TablePaymentViewScope) {
  const [state, setState] = useState<{
    scope: TablePaymentViewScope;
    data?: TablePaymentAccount;
  }>();
  useLayoutEffect(() => {
    let current = true;
    const guard = () => {
      if (!current) throw new ApiFailure(409, 'refused');
    };
    void Promise.resolve()
      .then(() => {
        guard();
        return scope.read(guard);
      })
      .then((data) => {
        guard();
        if (
          data.account.serviceSessionId !== scope.visit ||
          data.account.accountRevision !== scope.revision ||
          data.account.currency !== scope.currency
        )
          throw new ApiFailure(409, 'refused');
        setState({ scope, data });
      })
      .catch(() => {
        if (current) setState({ scope });
      });
    return () => {
      current = false;
    };
  }, [scope]);
  return { loading: state?.scope !== scope, data: state?.scope === scope ? state.data : undefined };
}
