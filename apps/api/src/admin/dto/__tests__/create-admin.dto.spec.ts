import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateAdminDto } from '../create-admin.dto';

describe('CreateAdminDto', () => {
  it.each([
    ['UPPER@EXAMPLE.COM', 'upper@example.com'],
    ['lower@example.com', 'lower@example.com'],
    ['MiXeD@Example.Com', 'mixed@example.com'],
    ['  spaced@example.com  ', 'spaced@example.com'],
    ['  MiXeD@Example.Com  ', 'mixed@example.com'],
  ])('normalizes %s to %s', (input, expected) => {
    const dto = plainToInstance(CreateAdminDto, { email: input });
    expect(dto.email).toBe(expected);
  });

  it('still validates as a real email after normalization', async () => {
    const dto = plainToInstance(CreateAdminDto, { email: '  ADMIN@Example.COM  ' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});
