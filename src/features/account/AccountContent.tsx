import { useTranslation } from 'react-i18next';
import Feedback from '../../ui/Feedback';
import SignInForm from './SignInForm';
import ProfileCard from './ProfileCard';
import type { AccountState } from './useAccount';
export default function AccountContent({ account }: Readonly<{ account: AccountState }>) {
  const { t } = useTranslation();
  const { session } = account;
  if (session.loading) return <Feedback message={t('loading')} loading />;
  if (session.failed) return <Feedback message={t('sessionUnavailable')} retry={session.retry} />;
  if (session.unavailable) return <Feedback message={t('accountUnavailable')} />;
  if (account.failure === 'logout' || session.needsCleanup) {
    const retry = account.busy
      ? undefined
      : () => {
          void account.logout();
        };
    return (
      <Feedback
        message={t(account.busy ? 'signingOut' : 'accountFailure.logout')}
        loading={account.busy}
        retry={retry}
      />
    );
  }
  if (session.userId)
    return <ProfileCard profile={account.profile} logout={account.logout} busy={account.busy} />;
  return <SignInForm account={account} />;
}
