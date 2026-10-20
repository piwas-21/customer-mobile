import { useRef, useState } from 'react';
import { Keyboard } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  completeNativeAccountAction,
  resetNativePasswordSchema,
} from '../../api/nativeAccountActions';
import { canUseNativeAccountLinks } from '../../core/capabilities';
import { resolveTenant, type Tenant } from '../../core/directory';
import { pendingAccountActions, type PendingAccountAction } from '../../core/pendingAccountAction';
import useMounted from '../../core/useMounted';
import { useRestaurant } from '../restaurant/RestaurantProvider';
import useBootstrap from '../restaurant/useBootstrap';

export default function useNativeAccountAction(entry: PendingAccountAction) {
  const { i18n } = useTranslation();
  const restaurant = useRestaurant();
  const bootstrap = useBootstrap();
  const mounted = useMounted();
  const pending = useRef(false);
  const [newPassword, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'busy' | 'done' | 'unknown'>('idle');
  const [inputFailed, setInputFailed] = useState(false);
  let tenant: Tenant | undefined;
  try {
    if (restaurant.directory) {
      const found = restaurant.directory.tenants.find((item) => item.slug === entry.slug);
      if (found) tenant = resolveTenant(restaurant.directory, found.id);
    }
  } catch {
    /* A retired/expired directory cannot supply an account destination. */
  }
  const selected = Boolean(tenant && restaurant.context?.tenant.id === tenant.id);
  const available = Boolean(
    selected &&
    tenant?.status === 'active' &&
    bootstrap.data?.tenantId === tenant?.id &&
    canUseNativeAccountLinks(bootstrap.data),
  );
  async function submit() {
    const { context, client } = restaurant;
    if (
      pending.current ||
      status !== 'idle' ||
      !available ||
      !context ||
      !client ||
      !pendingAccountActions.canTake(entry.id)
    )
      return;
    const password =
      entry.action === 'recover'
        ? resetNativePasswordSchema.safeParse({ newPassword, confirmPassword })
        : undefined;
    if (password && !password.success) {
      setInputFailed(true);
      return;
    }
    Keyboard.dismiss();
    pending.current = true;
    setStatus('busy');
    setInputFailed(false);
    try {
      const assertCurrent = () => {
        if (
          !mounted.current ||
          context.signal.aborted ||
          pendingAccountActions.snapshot()?.id !== entry.id ||
          entry.expiresAt <= Date.now()
        )
          throw new Error('Account action withdrawn');
      };
      assertCurrent();
      const proof = pendingAccountActions.take(entry.id);
      await completeNativeAccountAction(
        client,
        context,
        entry.action,
        proof,
        i18n.language,
        assertCurrent,
        password?.data,
      );
      if (mounted.current) setStatus('done');
    } catch {
      if (mounted.current) setStatus('unknown');
    } finally {
      pending.current = false;
      if (mounted.current) {
        setPassword('');
        setConfirmPassword('');
      }
    }
  }
  return {
    tenant,
    selected,
    available,
    loading: restaurant.loading || bootstrap.isPending,
    choose: () => {
      if (tenant) restaurant.select(tenant.id);
    },
    newPassword,
    setPassword,
    confirmPassword,
    setConfirmPassword,
    status: status === 'idle' && !pendingAccountActions.canTake(entry.id) ? 'unknown' : status,
    inputFailed,
    submit,
  };
}
