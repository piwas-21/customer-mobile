import type { z } from 'zod';
import { originalOperationProofSchema } from '../api/originalOperationProof';
import { ApiFailure } from './apiFailure';
export function originalTableBody<T>(
  value: unknown,
  initial: boolean,
  record: { intent: unknown; proof: unknown },
  submission: z.ZodType<T>,
) {
  const body = initial ? submission.parse(value) : originalOperationProofSchema.parse(value);
  const expected = initial ? { intent: record.intent, proof: record.proof } : record.proof;
  if (JSON.stringify(body) !== JSON.stringify(expected)) throw new ApiFailure(401, 'refused');
  return body;
}
