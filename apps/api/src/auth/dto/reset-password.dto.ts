import { IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({ example: 'raw-token-from-the-emailed-link' })
  @IsString()
  @MinLength(1)
  token!: string;

  @ApiProperty({ example: 'newStr0ngP@ssword', minLength: 12, maxLength: 128 })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  newPassword!: string;
}
