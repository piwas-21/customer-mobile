import type { TextInputProps } from 'react-native';
export function customerInputOptions(key: string): TextInputProps {
  if (key === 'email' || key === 'customerEmail')
    return {
      keyboardType: 'email-address',
      autoComplete: 'email',
      textContentType: 'emailAddress',
      autoCapitalize: 'none',
    };
  if (key === 'phone' || key === 'customerPhone')
    return { keyboardType: 'phone-pad', autoComplete: 'tel', textContentType: 'telephoneNumber' };
  if (key === 'postalCode') return { autoComplete: 'postal-code', textContentType: 'postalCode' };
  if (key === 'street')
    return { autoComplete: 'street-address', textContentType: 'fullStreetAddress' };
  if (key === 'name' || key === 'customerName')
    return { autoComplete: 'name', textContentType: 'name', autoCapitalize: 'words' };
  return {};
}
