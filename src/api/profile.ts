import { z } from 'zod';
import { ApiFailure } from '../core/transport';
import type { SessionController } from '../core/sessionController';
export const profileSchema = z.object({
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
export const profileEditSchema = z
  .object({
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    phoneNumber: z
      .string()
      .trim()
      .regex(/^(?:\+?[1-9]\d{1,14})?$/),
  })
  .strict();
export type ProfileEditInput = z.infer<typeof profileEditSchema>;
export async function readProfile(
  controller: SessionController,
  userId: string,
): Promise<CustomerProfile> {
  const profile = await controller.get(userId, '/api/User/profile', profileSchema);
  if (profile.id !== userId) throw new ApiFailure(200, 'contract');
  return profile;
}
export async function updateProfile(
  controller: SessionController,
  userId: string,
  input: ProfileEditInput,
  locale: string,
): Promise<CustomerProfile> {
  const body = profileEditSchema.parse(input);
  const profile = await controller.write(userId, '/api/User/profile', body, profileSchema, locale);
  if (
    profile.id !== userId ||
    profile.firstName !== body.firstName ||
    profile.lastName !== body.lastName ||
    profile.phoneNumber !== (body.phoneNumber || null)
  )
    throw new ApiFailure(200, 'contract');
  return profile;
}
