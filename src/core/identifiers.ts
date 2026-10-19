import { z } from 'zod';
const NIL_UUID = '00000000-0000-0000-0000-000000000000';
export const canonicalUuidSchema = z
  .uuid()
  .refine((value) => value === value.toLowerCase() && value !== NIL_UUID);
