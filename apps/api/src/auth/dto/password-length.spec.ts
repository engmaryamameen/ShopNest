import { validate } from 'class-validator';
import { RegisterDto } from './register.dto';
import { ResetPasswordDto } from './reset-password.dto';

describe('new password length', () => {
  it.each([['seven', 7, false], ['eight', 8, true], ['longer', 12, true], ['maximum', 128, true], ['over maximum', 129, false]])('%s characters', async (_name, length, valid) => {
    const password = 'a'.repeat(length);
    const register = Object.assign(new RegisterDto(), { email: 'test@example.com', password });
    const reset = Object.assign(new ResetPasswordDto(), { token: 'test-token', newPassword: password });
    expect((await validate(register)).length === 0).toBe(valid);
    expect((await validate(reset)).length === 0).toBe(valid);
  });
});
