import { z } from 'zod';
import { customerAddressSchema, type CustomerAddress } from './customerAddresses';
import { ApiFailure } from '../core/transport';
import type { SessionController } from '../core/sessionController';
const idSchema = z.uuid().transform((value) => value.toLowerCase());
export const requiredAddressFields = [
  'label',
  'addressLine1',
  'city',
  'postalCode',
  'country',
] as const;
export const addressInputSchema = customerAddressSchema
  .omit({ id: true })
  .superRefine((value, ctx) => {
    for (const field of requiredAddressFields) {
      if (!value[field].trim())
        ctx.addIssue({ code: 'custom', path: [field], message: 'Required' });
    }
  });
export type AddressInput = z.infer<typeof addressInputSchema>;
const writeResultSchema = z
  .object({ schemaVersion: z.literal(1), address: customerAddressSchema })
  .strict();
const actionResultSchema = z
  .object({
    schemaVersion: z.literal(1),
    addressId: idSchema,
    state: z.enum(['removed', 'default']),
  })
  .strict();
const path = '/api/customer-mobile/account/addresses';
export async function saveCustomerAddress(
  controller: SessionController,
  userId: string,
  input: AddressInput,
  locale: string,
  addressId?: string,
): Promise<CustomerAddress> {
  const address = addressInputSchema.parse(input);
  const id = addressId === undefined ? undefined : idSchema.parse(addressId);
  const result = await controller.write(
    userId,
    id ? `${path}/${id}` : path,
    { schemaVersion: 1, address },
    writeResultSchema,
    locale,
    id ? 'PUT' : 'POST',
  );
  const fields = Object.keys(address) as (keyof AddressInput)[];
  if (
    (id !== undefined && result.address.id !== id) ||
    fields.some((field) => result.address[field] !== address[field])
  )
    throw new ApiFailure(200, 'contract');
  return result.address;
}
export async function changeCustomerAddress(
  controller: SessionController,
  userId: string,
  addressId: string,
  action: 'remove' | 'default',
  locale: string,
): Promise<void> {
  const id = idSchema.parse(addressId);
  const result = await controller.write(
    userId,
    `${path}/${id}${action === 'default' ? '/set-default' : ''}`,
    { schemaVersion: 1 },
    actionResultSchema,
    locale,
    action === 'default' ? 'POST' : 'DELETE',
  );
  if (result.addressId !== id || result.state !== (action === 'default' ? 'default' : 'removed'))
    throw new ApiFailure(200, 'contract');
}
