import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { UserStatus } from '@prisma/client';

export class UpdateUserStatusDto {
  @ApiProperty({ enum: [UserStatus.ACTIVE, UserStatus.SUSPENDED] })
  @IsIn([UserStatus.ACTIVE, UserStatus.SUSPENDED])
  status!: typeof UserStatus.ACTIVE | typeof UserStatus.SUSPENDED;
}
