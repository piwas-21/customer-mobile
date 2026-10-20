import { runtimeConfig } from '../config';
import { pendingAccountActions } from './pendingAccountAction';

export function redirectNativeAccountIntent(path: string): string {
  try {
    const url = new URL(path);
    const accountPath = /\/(verify|recover)(?:\/|$)/.test(url.pathname);
    if (!accountPath && !url.hash && !url.searchParams.has('proof')) return path;
    // Strip every fragment before Expo Router builds navigation state, even for invalid links.
    if (runtimeConfig) pendingAccountActions.capture(path, runtimeConfig.linkOrigin);
    else pendingAccountActions.clear();
    return '/account-action';
  } catch {
    pendingAccountActions.clear();
    return '/';
  }
}
