import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsInt, IsOptional, Min } from 'class-validator';

// code/type/value/scope/vendorId/startsAt are immutable after creation —
// changing the fundamental terms of a code that may already be redeemed
// is a correctness hazard past orders' snapshotted amountCents don't need
// to track. Only the operational knobs are editable.
export class UpdatePromotionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  maxRedemptions?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  maxRedemptionsPerUser?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  minSubtotalCents?: number;
}
