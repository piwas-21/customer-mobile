import { tenantA } from './fixtures';
export const customerProfile = {
  id: tenantA,
  email: 'alex@example.test',
  firstName: 'Alex',
  lastName: 'Guest',
  phoneNumber: null,
  role: 'Customer' as const,
  isDeleted: false as const,
  isEmailConfirmed: true,
};
