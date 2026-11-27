import { IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { OrderStatus } from '@prisma/client';

export class UpdateVendorOrderStatusDto {
  @ApiProperty({ enum: ['CONFIRMED', 'SHIPPED'], description: 'A vendor may confirm or ship their own order — see order-state-machine.ts for the full transition table' })
  @IsIn(['CONFIRMED', 'SHIPPED'] satisfies OrderStatus[])
  status!: 'CONFIRMED' | 'SHIPPED';
}
