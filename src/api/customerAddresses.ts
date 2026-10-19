import { z } from 'zod';
import { ApiFailure } from '../core/transport';
import type { SessionController } from '../core/sessionController';
const addressId = z.uuid().transform((value) => value.toLowerCase());
export const addressTextLimits = {
  label: 50,
  addressLine1: 200,
  addressLine2: 200,
  city: 100,
  state: 100,
  postalCode: 20,
  country: 100,
  phone: 20,
  deliveryInstructions: 500,
} as const;
// PostgreSQL varchar limits count Unicode code points; JS length counts UTF-16 units.
function databaseText(maxCharacters: number) {
  return z
    .string()
    .max(maxCharacters * 2)
    .refine(
      (value) =>
        value.length <= maxCharacters * 2 &&
        Array.from(value).length <= maxCharacters &&
        !value.includes('\0'),
    );
}
export const customerAddressSchema = z
  .object({
    id: addressId,
    label: databaseText(addressTextLimits.label),
    addressLine1: databaseText(addressTextLimits.addressLine1),
    addressLine2: databaseText(addressTextLimits.addressLine2).nullable(),
    city: databaseText(addressTextLimits.city),
    state: databaseText(addressTextLimits.state).nullable(),
    postalCode: databaseText(addressTextLimits.postalCode),
    country: databaseText(addressTextLimits.country),
    phone: databaseText(addressTextLimits.phone).nullable(),
    isDefault: z.boolean(),
    deliveryInstructions: databaseText(addressTextLimits.deliveryInstructions).nullable(),
  })
  .strict();
export type CustomerAddress = z.infer<typeof customerAddressSchema>;
export const customerAddressPageSchema = z
  .object({
    schemaVersion: z.literal(1),
    items: z.array(customerAddressSchema).max(20),
    nextAfterId: addressId.nullable(),
  })
  .strict()
  .refine((page) => {
    if (page.items.some((item, index) => index > 0 && item.id <= page.items[index - 1]!.id))
      return false;
    return (
      page.nextAfterId === null ||
      (page.items.length === 20 && page.nextAfterId === page.items.at(-1)?.id)
    );
  });
export async function readCustomerAddresses(
  controller: SessionController,
  userId: string,
  afterId?: string,
) {
  const cursor = afterId === undefined ? undefined : addressId.parse(afterId);
  const query = cursor === undefined ? '' : `&afterId=${encodeURIComponent(cursor)}`;
  const page = await controller.get(
    userId,
    `/api/customer-mobile/account/addresses?schemaVersion=1${query}`,
    customerAddressPageSchema,
  );
  if (cursor && page.items.some((item) => item.id <= cursor)) throw new ApiFailure(200, 'contract');
  return page;
}
