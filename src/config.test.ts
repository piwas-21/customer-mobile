const savedEnvironment = { ...process.env };
afterEach(() => {
  process.env = { ...savedEnvironment };
});
it.each([
  ['staging', 'https://directory.example', 'https://links.example', true],
  ['production', 'https://directory.example', 'https://links.example', true],
  ['other', 'https://directory.example', 'https://links.example', false],
  ['staging', 'http://directory.example', 'https://links.example', false],
  ['staging', 'https://directory.example/private', 'https://links.example', false],
])(
  'validates the %s runtime configuration before networking',
  (environment, directory, links, valid) => {
    process.env.EXPO_PUBLIC_ENVIRONMENT = environment;
    process.env.EXPO_PUBLIC_MOBILE_DIRECTORY_ORIGIN = directory;
    process.env.EXPO_PUBLIC_MOBILE_LINK_ORIGIN = links;
    jest.isolateModules(() => {
      const { runtimeConfig } = jest.requireActual<typeof import('./config')>('./config');
      expect(Boolean(runtimeConfig)).toBe(valid);
    });
  },
);

it.each([
  undefined,
  'invalid',
  '["http://checkout.example.test"]',
  '["https://checkout.example.test"]',
])('payment origin config %s cannot bypass the explicit browser allowlist', (value) => {
  process.env.EXPO_PUBLIC_ENVIRONMENT = 'staging';
  process.env.EXPO_PUBLIC_MOBILE_DIRECTORY_ORIGIN = 'https://directory.example';
  process.env.EXPO_PUBLIC_MOBILE_LINK_ORIGIN = 'https://links.example';
  if (value === undefined) delete process.env.EXPO_PUBLIC_HOSTED_CHECKOUT_ORIGINS;
  else process.env.EXPO_PUBLIC_HOSTED_CHECKOUT_ORIGINS = value;
  jest.isolateModules(() => {
    const { runtimeConfig } = jest.requireActual<typeof import('./config')>('./config');
    expect(runtimeConfig?.hostedCheckoutOrigins).toEqual(
      value === '["https://checkout.example.test"]' ? ['https://checkout.example.test'] : [],
    );
  });
});
