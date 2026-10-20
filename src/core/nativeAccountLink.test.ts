import { parseNativeAccountLink } from './nativeAccountLink';
import { PendingAccountActions } from './pendingAccountAction';
const origin = 'https://links.example';
const proof = 'A'.repeat(96);
const url = `${origin}/r/alpha/verify#proof=${proof}`;
beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});
it('accepts only canonical shared verification/recovery fragments and bounds their private proofs', () => {
  expect(parseNativeAccountLink(url, origin)).toEqual({ slug: 'alpha', action: 'verify', proof });
  expect(parseNativeAccountLink(url.replace('/verify', '/recover'), origin).action).toBe('recover');
  expect(parseNativeAccountLink(url.replace(proof, 'A'.repeat(4096)), origin).proof).toHaveLength(
    4096,
  );
});
it.each([
  url.replace(origin, 'https://foreign.example'),
  url.replace('https:', 'http:'),
  url.replace('/alpha/', '/beta/../alpha/'),
  url.replace('links.example', 'user@links.example'),
  url.replace('links.example', 'links.example:443'),
  url.replace('verify#', 'verify/?#'),
  url.replace('#proof=', '?proof='),
  url + '&proof=other',
  url + '?anything',
  url.replace('proof=', 'token='),
  url.replace('verify', 'menu'),
  url.replace(proof, 'A'.repeat(95)),
  url.replace(proof, 'A'.repeat(4097)),
  url.replace(proof, '%41'.repeat(96)),
  url.replace(proof, 'a+b'),
  url.replace('/alpha/', '/ALPHA/'),
  'invalid',
])('rejects malformed or untrusted account links without disclosing their input', (value) => {
  expect(() => parseNativeAccountLink(value, origin)).toThrow();
});
it('exposes only public metadata, permits one explicit proof take and rejects stale ids', () => {
  const store = new PendingAccountActions();
  const listener = jest.fn();
  const unsubscribe = store.subscribe(listener);
  expect(store.capture(url, origin)).toBe(true);
  const first = store.snapshot()!;
  expect(JSON.stringify(first)).not.toContain(proof);
  expect(first).toEqual({
    id: 1,
    slug: 'alpha',
    action: 'verify',
    expiresAt: Date.now() + 600_000,
  });
  expect(store.snapshot()).toBe(first);
  expect(store.take(first.id)).toBe(proof);
  expect(() => store.take(first.id)).toThrow();
  expect(store.capture(url.replace('/alpha/', '/beta/'), origin)).toBe(true);
  store.clear(first.id);
  expect(store.snapshot()?.slug).toBe('beta');
  expect(() => store.take(first.id)).toThrow();
  store.clear();
  expect(store.snapshot()).toBeUndefined();
  expect(listener).toHaveBeenCalledTimes(3);
  unsubscribe();
  store.clear();
  expect(listener).toHaveBeenCalledTimes(3);
});
it('withdraws old proofs on invalid replacement, expiry and a new process instance', () => {
  const store = new PendingAccountActions();
  store.capture(url, origin);
  expect(store.capture('invalid', origin)).toBe(false);
  expect(store.snapshot()).toBeUndefined();
  store.capture(url, origin);
  const entry = store.snapshot()!;
  expect(() => store.take(entry.id, entry.expiresAt)).toThrow('expired');
  expect(store.snapshot()).toBeUndefined();
  store.capture(url, origin);
  jest.advanceTimersByTime(600_000);
  expect(store.snapshot()).toBeUndefined();
  expect(new PendingAccountActions().snapshot()).toBeUndefined();
});
