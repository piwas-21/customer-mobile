import { z } from 'zod';
export const orderTypeSchema = z.enum(['DineIn', 'Takeaway', 'Delivery']);
export type OrderType = z.infer<typeof orderTypeSchema>;
export const orderTypesSchema = z
  .array(orderTypeSchema)
  .max(orderTypeSchema.options.length)
  .refine((types) => new Set(types).size === types.length);
