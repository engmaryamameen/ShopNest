import { IsString, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CheckoutDto {
  @ApiProperty({
    description: 'Client-generated idempotency key — use same key to safely retry',
    example: 'client-uuid-v4-here',
  })
  @IsString()
  @IsUUID('4')
  idempotencyKey!: string;
}
