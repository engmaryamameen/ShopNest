import { IsUUID, IsInt, IsPositive } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpsertCartItemDto {
  @ApiProperty({ example: 'uuid-of-product' })
  @IsUUID('4')
  productId!: string;

  @ApiProperty({ example: 2, minimum: 1, description: 'Quantity to set (not delta)' })
  @IsInt()
  @IsPositive()
  quantity!: number;
}
