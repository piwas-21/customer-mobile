import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Keyboard } from 'react-native';
import { loginSchema } from '../../api/auth';
import { readProfile } from '../../api/profile';
import { useRestaurant } from '../restaurant/RestaurantProvider';
import { useSession } from './SessionProvider';
export default function useAccount() {
  const session = useSession();
  const { context } = useRestaurant();
  const { i18n } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<'input' | 'login' | 'logout'>();
  const profile = useQuery({
    queryKey: [
      context?.environment,
      context?.tenant.id,
      `customer:${session.userId}`,
      'profile',
      context?.generation,
    ],
    queryFn: () => {
      if (!session.controller || !session.userId) throw new Error('Customer session is required');
      return readProfile(session.controller, session.userId);
    },
    enabled: Boolean(
      !session.loading && !session.unavailable && session.controller && session.userId,
    ),
    retry: false,
    staleTime: 30_000,
  });
  async function login() {
    if (busy || !session.controller || session.loading || session.unavailable) return;
    const input = loginSchema.safeParse({ email, password });
    if (!input.success) {
      setFailure('input');
      return;
    }
    Keyboard.dismiss();
    setBusy(true);
    setFailure(undefined);
    try {
      await session.controller.login(input.data, i18n.language);
      setEmail('');
    } catch {
      setFailure('login');
    } finally {
      setPassword('');
      setBusy(false);
    }
  }
  async function logout() {
    if (busy || !session.controller) return;
    setBusy(true);
    setFailure(undefined);
    try {
      await session.controller.logout();
    } catch {
      setFailure('logout');
    } finally {
      setPassword('');
      setBusy(false);
    }
  }
  return { session, email, setEmail, password, setPassword, login, logout, busy, failure, profile };
}
