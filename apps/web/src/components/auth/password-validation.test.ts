import { passwordError, confirmationError } from './password-validation';

test('new passwords require at least eight characters without imposing a numeric or exact-length rule', () => {
  expect(passwordError('1234567', true)).toBe('Use at least 8 characters.');
  expect(passwordError('abcdefgh', true)).toBeUndefined();
  expect(passwordError('a-longer-password', true)).toBeUndefined();
  expect(passwordError('x'.repeat(129), true)).toBeDefined();
});
test('confirmation reports a mismatch and clears when corrected', () => {
  expect(confirmationError('different', 'password', false)).toBe('Passwords do not match.');
  expect(confirmationError('password', 'password', false)).toBeUndefined();
});
