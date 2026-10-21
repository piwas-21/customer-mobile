import { TableAdmissionInbox } from './tableAdmissionInbox';
import { tenantA, tenantB } from '../test/fixtures';
it('hands off only once to the exact restaurant and exposes only a change counter', () => {
  const inbox = new TableAdmissionInbox();
  const changed = jest.fn();
  const unsubscribe = inbox.subscribe(changed);
  inbox.receive(tenantA, 'secret-table-qr');
  expect(typeof inbox.snapshot()).toBe('number');
  expect(changed).toHaveBeenCalledTimes(1);
  expect(inbox.take(tenantA)).toBe('secret-table-qr');
  expect(inbox.take(tenantA)).toBeNull();
  inbox.receive(tenantA, 'second');
  expect(inbox.take(tenantB)).toBeNull();
  expect(inbox.take(tenantA)).toBeNull();
  unsubscribe();
  inbox.receive(tenantA, 'third');
  expect(changed).toHaveBeenCalledTimes(2);
});
it('forgets an expired or backwards-clock QR rather than restoring delayed admission authority', () => {
  const time = jest.spyOn(Date, 'now');
  const inbox = new TableAdmissionInbox();
  try {
    time.mockReturnValue(1000000);
    inbox.receive(tenantA, 'expired');
    time.mockReturnValue(1120000);
    expect(inbox.take(tenantA)).toBeNull();
    time.mockReturnValue(1000000);
    inbox.receive(tenantA, 'future');
    time.mockReturnValue(999999);
    expect(inbox.take(tenantA)).toBeNull();
  } finally {
    time.mockRestore();
  }
});
it('withdraws old authority and publishes a change when clearing or rejecting a new capture', () => {
  const inbox = new TableAdmissionInbox();
  const changed = jest.fn();
  inbox.subscribe(changed);
  inbox.receive(tenantA, 'first');
  const previous = inbox.snapshot();
  expect(() => inbox.receive(tenantA, ' ')).toThrow();
  expect(inbox.snapshot()).toBe(previous + 1);
  expect(inbox.take(tenantA)).toBeNull();
  inbox.receive(tenantA, 'second');
  inbox.clear();
  expect(inbox.take(tenantA)).toBeNull();
  expect(changed).toHaveBeenCalledTimes(4);
});

it('an empty handoff remains empty even for an invalid tenant identity', () => {
  expect(new TableAdmissionInbox().take('invalid')).toBeNull();
});
