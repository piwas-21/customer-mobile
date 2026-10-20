import type { SecretStore } from './credentials';
// A resolved storage promise alone does not prove that an exact private value is durable.
export async function saveAcknowledgedSecret(store: SecretStore, key: string, wire: string) {
  await store.set(key, wire);
  if ((await store.get(key)) !== wire) throw new Error('Secure value save incomplete');
}
export async function removeAcknowledgedSecret(store: SecretStore, key: string) {
  await store.remove(key);
  if ((await store.get(key)) !== null) throw new Error('Secure value removal incomplete');
}
