import { useState } from 'react';
import SignInForm from './SignInForm';
import AccountRequestForm from './AccountRequestForm';
import type { AccountState } from './useAccount';
import { useRestaurant } from '../restaurant/RestaurantProvider';
import type { AccountRequestMode } from './AccountRequestForm';
import useBootstrap from '../restaurant/useBootstrap';
import { canUseNativeAccountLinks } from '../../core/capabilities';
export default function AccountAccess({ account }: Readonly<{ account: AccountState }>) {
  const { context } = useRestaurant();
  const bootstrap = useBootstrap();
  const [mode, setMode] = useState<'signin' | AccountRequestMode>('signin');
  function changeMode(next: typeof mode) {
    account.setPassword('');
    setMode(next);
  }
  if (mode !== 'signin')
    return (
      <AccountRequestForm
        key={`${mode}:${context?.environment}:${context?.tenant.id}:${context?.generation}:${canUseNativeAccountLinks(bootstrap.data)}`}
        mode={mode}
        onBack={() => changeMode('signin')}
      />
    );
  return (
    <SignInForm
      account={account}
      onRegister={() => changeMode('register')}
      onRecovery={() => changeMode('recovery')}
      onVerification={() => changeMode('verification')}
    />
  );
}
