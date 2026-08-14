import { IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class InviteVendorStaffDto {
  @ApiProperty({ example: 'staff@example.com' })
  @IsEmail()
  email!: string;
}
