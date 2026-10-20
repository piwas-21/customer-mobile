import { z } from 'zod';

export const NATIVE_ACCOUNT_PASSWORD_MAX_LENGTH = 1000;
export const nativeAccountProofSchema = z.string().regex(/^[A-Za-z0-9_-]{96,4096}$/);
