import { useState } from 'react';
import { Keyboard } from 'react-native';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { profileEditSchema, updateProfile, type CustomerProfile } from '../../api/profile';
import type { SessionController } from '../../core/sessionController';
import useMounted from '../../core/useMounted';
import useAccountRequest from './useAccountRequest';
export default function useProfileEdit(
  profile: CustomerProfile,
  controller: SessionController,
  queryKey: QueryKey,
  onSaved: () => void,
  onCancel: () => void,
) {
  const [firstName, setFirstName] = useState(profile.firstName);
  const [lastName, setLastName] = useState(profile.lastName);
  const [phoneNumber, setPhoneNumber] = useState(profile.phoneNumber ?? '');
  const mounted = useMounted();
  const queryClient = useQueryClient();
  const { i18n } = useTranslation();
  const form = useAccountRequest(
    profileEditSchema,
    async (input) => {
      const assertCurrent = controller.captureRequestOwner({ kind: 'customer', id: profile.id });
      const updated = await updateProfile(controller, profile.id, input, i18n.language);
      assertCurrent();
      if (!mounted.current) return;
      await queryClient.cancelQueries({ queryKey, exact: true });
      assertCurrent();
      if (mounted.current) queryClient.setQueryData(queryKey, updated);
    },
    () => {},
  );
  async function save() {
    Keyboard.dismiss();
    if ((await form.submit({ firstName, lastName, phoneNumber })) && mounted.current) onSaved();
  }
  function cancel() {
    if (form.canLeave()) onCancel();
  }
  const parsed = profileEditSchema.safeParse({ firstName, lastName, phoneNumber });
  const invalid = (field: string) =>
    form.failure === 'input' &&
    !parsed.success &&
    parsed.error.issues.some((issue) => issue.path[0] === field);
  return {
    ...form,
    firstName,
    setFirstName,
    lastName,
    setLastName,
    phoneNumber,
    setPhoneNumber,
    save,
    cancel,
    invalid,
  };
}
