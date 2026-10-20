import { redirectNativeAccountIntent } from '../src/core/nativeAccountIntent';

export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  return redirectNativeAccountIntent(path);
}
