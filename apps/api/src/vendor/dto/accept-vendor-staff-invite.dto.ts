import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AcceptVendorStaffInviteDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  token!: string;
}
