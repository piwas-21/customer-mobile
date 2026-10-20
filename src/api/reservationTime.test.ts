import { compareReservationTimes } from './reservationTime';

it.each([
  ['18:30:00', '18:30:00.0000000', 0],
  ['18:30:00.1234567', '18:30:00.1234566', 1],
  ['1.00:00:00', '23:59:59.9999999', 1],
  ['-00:00:02', '-00:00:01', -1],
  ['-1.00:00:00', '-23:59:59', -1],
  ['00:00:01', '-00:00:01', 1],
  ['-00:00:00', '00:00:00.0000000', 0],
  ['-00:00:00.0000001', '00:00:00', -1],
])('orders wire durations %s / %s exactly', (left, right, sign) => {
  expect(Math.sign(compareReservationTimes(left, right))).toBe(sign);
});
it('refuses invalid comparison inputs', () => {
  expect(() => compareReservationTimes('bad', '18:30:00')).toThrow('Invalid reservation time');
});
