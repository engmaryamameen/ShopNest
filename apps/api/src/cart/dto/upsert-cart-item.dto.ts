import { IsUUID, IsInt, IsPositive } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpsertCartItemDto {
  @ApiProperty({ example: 'uuid-of-vendor-offer', description: "The specific seller's listing to add — not the canonical product id" })
  @IsUUID('4')
  vendorOfferId!: string;

  @ApiProperty({ example: 2, minimum: 1, description: 'Quantity to set (not delta)' })
  @IsInt()
  @IsPositive()
  quantity!: number;
}
