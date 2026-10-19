import { z } from 'zod';
export const emptyUuid = '00000000-0000-0000-0000-000000000000';
export const canonicalUuidSchema = z
  .uuid()
  .refine((value) => value === value.toLowerCase() && value !== emptyUuid);
