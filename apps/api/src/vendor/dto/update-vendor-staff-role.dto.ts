import { IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { VendorMemberRole } from '@prisma/client';

export class UpdateVendorStaffRoleDto {
  @ApiProperty({ enum: ['OWNER', 'STAFF'] })
  @IsIn(['OWNER', 'STAFF'] satisfies VendorMemberRole[])
  role!: VendorMemberRole;
}
