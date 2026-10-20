import { originSchema } from './directory';
import { nativeAccountProofSchema } from '../domain/nativeAccountPolicy';

const ACCOUNT_LINK_MAX_LENGTH = 8192;
export type NativeAccountAction = 'verify' | 'recover';
export type NativeAccountLink = Readonly<{
  slug: string;
  action: NativeAccountAction;
  proof: string;
}>;
export function parseNativeAccountLink(value: string, linkOrigin: string): NativeAccountLink {
  originSchema.parse(linkOrigin);
  if (value.length > ACCOUNT_LINK_MAX_LENGTH) throw new Error('Invalid account link');
  const url = new URL(value);
  const path = /^\/r\/([a-z0-9]+(?:-[a-z0-9]+)*)\/(verify|recover)$/.exec(url.pathname);
  const fragment = /^#proof=([A-Za-z0-9_-]+)$/.exec(url.hash);
  if (
    url.href !== value ||
    url.origin !== linkOrigin ||
    url.username ||
    url.password ||
    url.search ||
    !path ||
    !fragment
  )
    throw new Error('Invalid account link');
  return {
    slug: path[1]!,
    action: path[2] === 'verify' ? 'verify' : 'recover',
    proof: nativeAccountProofSchema.parse(fragment[1]),
  };
}
