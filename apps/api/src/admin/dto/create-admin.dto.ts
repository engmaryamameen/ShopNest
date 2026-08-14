import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class CreateAdminDto {
  @ApiProperty({ example: 'new-admin@shopnest.dev' })
  @IsEmail()
  email!: string;
}
