import { isSupportedPassword } from './passwordPolicy';
it.each(['aB3!xyZ9', 'Str0ng!Passw0rd', 'MyPassword123!'])(
  'accepts the server-supported password %s',
  (value) => {
    expect(isSupportedPassword(value)).toBe(true);
  },
);
it.each([
  'Ab1!xy',
  'lower1!text',
  'UPPER1!TEXT',
  'Missing!Digit',
  'Missing1Symbol',
  'Ab1!aaaa',
  'password123',
  'Aa1!'.repeat(257),
])('rejects a password violating the active server or bounded client policy', (value) => {
  expect(isSupportedPassword(value)).toBe(false);
});

it('accepts the bounded maximum and rejects one additional otherwise-valid character', () => {
  expect(isSupportedPassword('Aa1!'.repeat(256))).toBe(true);
  expect(isSupportedPassword('Aa1!'.repeat(256) + 'a')).toBe(false);
});
