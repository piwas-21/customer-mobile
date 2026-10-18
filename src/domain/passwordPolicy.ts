// Mirrors the active backend PasswordRules/StrongPasswordValidator checks.
// Four required character classes already imply four distinct characters; every
// entry in the backend's exact common-password list fails those basic classes.
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 1024;
export function isSupportedPassword(value: string): boolean {
  return (
    value.length >= PASSWORD_MIN_LENGTH &&
    value.length <= PASSWORD_MAX_LENGTH &&
    /[a-z]/.test(value) &&
    /[A-Z]/.test(value) &&
    /\d/.test(value) &&
    /[^a-zA-Z0-9]/.test(value) &&
    !/(.)\1{2,}/.test(value)
  );
}
