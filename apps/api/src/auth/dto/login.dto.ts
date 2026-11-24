import { IsEmail, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { normalizeEmail } from './normalize-email';

export class LoginDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  @Transform(({ value }: { value: unknown }) => normalizeEmail(value))
  email!: string;

  @ApiProperty({ example: 'str0ngP@ssword' })
  @IsString()
  password!: string;
}
