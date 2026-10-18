import { useState } from 'react';
import SignInForm from './SignInForm';
import AccountRequestForm from './AccountRequestForm';
import type { AccountState } from './useAccount';
export default function AccountAccess({ account }: Readonly<{ account: AccountState }>) {
  const [mode, setMode] = useState<'signin' | 'register' | 'recovery'>('signin');
  function changeMode(next: typeof mode) {
    account.setPassword('');
    setMode(next);
  }
  if (mode !== 'signin')
    return <AccountRequestForm key={mode} mode={mode} onBack={() => changeMode('signin')} />;
  return (
    <SignInForm
      account={account}
      onRegister={() => changeMode('register')}
      onRecovery={() => changeMode('recovery')}
    />
  );
}
