import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { RegisterDto } from './register.dto';
import { LoginDto } from './login.dto';
import { ForgotPasswordDto } from './forgot-password.dto';
import { ResendVerificationDto } from './resend-verification.dto';

describe.each([RegisterDto, LoginDto, ForgotPasswordDto, ResendVerificationDto])('%s email validation', (Dto) => {
  it('normalizes email addresses', () => {
    const dto = plainToInstance(Dto, { email: '  Person@Example.COM  ', password: 'ValidPassword123!' });
    expect(dto.email).toBe('person@example.com');
  });

  it.each([null, {}, [], 123])('rejects invalid input without throwing', (email) => {
    const dto = plainToInstance(Dto, { email, password: 'ValidPassword123!' });
    expect(validateSync(dto).some((error) => error.property === 'email')).toBe(true);
  });
});
