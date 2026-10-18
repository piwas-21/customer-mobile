import { z } from 'zod';
import { ApiFailure } from '../core/transport';
import type { SessionController } from '../core/sessionController';
const profileSchema = z.object({
  id: z.uuid(),
  role: z.literal('Customer'),
  isDeleted: z.literal(false),
  email: z.email(),
  firstName: z.string().max(100),
  lastName: z.string().max(100),
  phoneNumber: z.string().nullable(),
  isEmailConfirmed: z.boolean(),
});
export type CustomerProfile = z.infer<typeof profileSchema>;
export async function readProfile(
  controller: SessionController,
  userId: string,
): Promise<CustomerProfile> {
  const profile = await controller.get(userId, '/api/User/profile', profileSchema);
  if (profile.id !== userId) throw new ApiFailure(200, 'contract');
  return profile;
}
