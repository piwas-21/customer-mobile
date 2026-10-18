import { parseDirectory } from '../core/directory';
export const tenantA = '11111111-1111-4111-8111-111111111111';
export const tenantB = '22222222-2222-4222-8222-222222222222';
export function directoryInput(now = Date.now()) {
  return {
    schemaVersion: 1,
    revision: 'fixture-1',
    environment: 'staging',
    publishedAt: new Date(now - 1000).toISOString(),
    expiresAt: new Date(now + 60_000).toISOString(),
    tenants: [
      {
        id: tenantA,
        slug: 'alpha',
        name: 'Alpha',
        apiOrigin: 'https://alpha.example',
        webOrigin: 'https://alpha.example',
        imageOrigin: 'https://alpha.example',
        status: 'active',
        contractVersions: [1],
      },
      {
        id: tenantB,
        slug: 'beta',
        name: 'Beta',
        apiOrigin: 'https://beta.example',
        webOrigin: 'https://beta.example',
        imageOrigin: 'https://beta.example',
        status: 'active',
        contractVersions: [1],
      },
    ],
  };
}
export function fixtureDirectory() {
  return parseDirectory(directoryInput(), 'staging');
}
export function memorySecrets() {
  const values = new Map<string, string>();
  return {
    values,
    get: (key: string) => Promise.resolve(values.get(key) ?? null),
    set: (key: string, value: string) => {
      values.set(key, value);
      return Promise.resolve();
    },
    remove: (key: string) => {
      values.delete(key);
      return Promise.resolve();
    },
  };
}
