import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyEmailDto {
  @ApiProperty({ example: 'raw-token-from-the-emailed-link' })
  @IsString()
  @MinLength(1)
  token!: string;
}
