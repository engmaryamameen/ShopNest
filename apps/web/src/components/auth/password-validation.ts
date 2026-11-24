export function passwordError(value: string, required: boolean): string | undefined {
  if (!value) return required ? 'Please enter a password.' : undefined;
  if (Array.from(value).length < 8) return 'Use at least 8 characters.';
  if (Array.from(value).length > 128) return 'Use no more than 128 characters.';
  return undefined;
}
export function confirmationError(value: string, password: string, required: boolean): string | undefined {
  if (!value) return required ? 'Please confirm your password.' : undefined;
  return value !== password ? 'Passwords do not match.' : undefined;
}
