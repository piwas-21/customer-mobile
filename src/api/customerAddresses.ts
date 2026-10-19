import { z } from 'zod';
import { ApiFailure } from '../core/transport';
import type { SessionController } from '../core/sessionController';
const addressId = z.uuid().transform((value) => value.toLowerCase());
// PostgreSQL varchar limits count Unicode code points; JS length counts UTF-16 units.
function databaseText(maxCharacters: number) {
  return z
    .string()
    .max(maxCharacters * 2)
    .refine(
      (value) => value.length <= maxCharacters * 2 && Array.from(value).length <= maxCharacters,
    );
}
export const customerAddressSchema = z
  .object({
    id: addressId,
    label: databaseText(50),
    addressLine1: databaseText(200),
    addressLine2: databaseText(200).nullable(),
    city: databaseText(100),
    state: databaseText(100).nullable(),
    postalCode: databaseText(20),
    country: databaseText(100),
    phone: databaseText(20).nullable(),
    isDefault: z.boolean(),
    deliveryInstructions: databaseText(500).nullable(),
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
