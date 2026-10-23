import { tablePaymentReturnDestination } from './tablePaymentReturnDestination';
import { resolveLink } from './links';
import { fixtureDirectory, tenantA, tenantB } from '../test/fixtures';
const origin = 'https://links.example';
const url = `${origin}/r/alpha/table-payment-return/${tenantA}?operation=${tenantB}`;
it('keeps a public attempt separate from an order identity and navigates without payment authority', () => {
  expect(resolveLink(url, origin, fixtureDirectory())).toEqual({
    tenantId: tenantA,
    destination: 'table-payment-return',
    attemptId: tenantA,
    operationId: tenantB,
  });
  expect(tablePaymentReturnDestination(url, origin, fixtureDirectory())).toEqual({
    tenantId: tenantA,
    pathname: '/table',
  });
  expect(
    JSON.stringify(tablePaymentReturnDestination(url, origin, fixtureDirectory())),
  ).not.toMatch(/paid|attemptId|orderId|operation/);
});
it.each([
  url.replace(origin, 'https://evil.example'),
  url + '&paid=true',
  url + '&operation=' + tenantB,
  url.replace(tenantB, 'invalid'),
  url.replace('alpha', 'missing'),
  url.replace('table-payment-return', 'payment-return'),
  url.replace('?operation=' + tenantB, ''),
])('rejects untrusted, ambiguous or order payment navigation %s', (value) => {
  expect(() => tablePaymentReturnDestination(value, origin, fixtureDirectory())).toThrow();
});
