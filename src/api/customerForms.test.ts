import { customerFormsSchema, readCustomerForms } from './customerForms';
import { customerForms } from '../test/customerForms';
import { basketControllerFixture } from '../test/basketController';
import { response } from '../test/transport';
it('reads the public configuration without borrowing the signed-in customer session', async () => {
  const f = await basketControllerFixture(true);
  f.fetcher.mockResolvedValue(response({ success: true, data: customerForms() }));
  await expect(readCustomerForms(f.client, f.context)).resolves.toEqual(customerForms());
  const [url, request] = f.fetcher.mock.calls[0]!;
  expect(url).toContain('/api/FormFieldConfiguration');
  expect(request.method).toBe('GET');
  expect(request.headers).not.toHaveProperty('Authorization');
  expect(request.headers).not.toHaveProperty('X-Session-Id');
});
it.each([
  { isVisible: false, isRequired: true, isLocked: false },
  { isVisible: true, isRequired: false, isLocked: true },
  { isVisible: 'false', isRequired: false, isLocked: false },
])('rejects contradictory or mistyped field flags %j', (patch) => {
  const config = customerForms();
  expect(() =>
    customerFormsSchema.parse([{ ...config[0], fields: [{ ...config[0]!.fields[0], ...patch }] }]),
  ).toThrow();
});
it('rejects duplicate forms and field identities', () => {
  const config = customerForms();
  expect(() => customerFormsSchema.parse([...config, config[0]])).toThrow();
  config[0]!.fields.push(config[0]!.fields[0]!);
  expect(() => customerFormsSchema.parse(config)).toThrow();
});
it('accepts bounded configuration and refuses an oversized response', () => {
  const forms = Array.from({ length: 32 }, (_, index) => ({ formKey: `form${index}`, fields: [] }));
  expect(customerFormsSchema.parse(forms)).toHaveLength(32);
  expect(() => customerFormsSchema.parse([...forms, { formKey: 'extra', fields: [] }])).toThrow();
});
