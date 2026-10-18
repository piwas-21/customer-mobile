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
  'Aa1!' + 'x'.repeat(1021),
])('rejects a password violating the active server or bounded client policy', (value) => {
  expect(isSupportedPassword(value)).toBe(false);
});
