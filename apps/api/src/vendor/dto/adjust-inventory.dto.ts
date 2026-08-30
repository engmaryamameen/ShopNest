import { IsIn, IsInt, IsOptional, IsString, MaxLength, NotEquals } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InventoryAdjustmentReason } from '@prisma/client';

export class AdjustInventoryDto {
  @ApiProperty({ example: 10, description: 'Positive to add stock, negative to remove — never an absolute "set to" value' })
  @IsInt()
  @NotEquals(0)
  delta!: number;

  @ApiProperty({ enum: ['RESTOCK', 'CORRECTION'], description: 'Vendor-initiated reasons only — SALE/RETURN are written by checkout/cancellation, never directly' })
  @IsIn(['RESTOCK', 'CORRECTION'] satisfies InventoryAdjustmentReason[])
  reason!: 'RESTOCK' | 'CORRECTION';

  @ApiPropertyOptional({ example: 'PO-2026-0143' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reference?: string;
}
