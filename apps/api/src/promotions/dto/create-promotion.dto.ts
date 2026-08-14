import { Transform } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsPositive, IsString, Min, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PromotionType } from '@prisma/client';

export class CreatePromotionDto {
  @ApiProperty({ example: 'SAVE10' })
  @IsString()
  @MinLength(3)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  code!: string;

  @ApiProperty({ enum: ['PERCENT', 'FIXED_AMOUNT'] })
  @IsIn(['PERCENT', 'FIXED_AMOUNT'] satisfies PromotionType[])
  type!: PromotionType;

  @ApiProperty({ example: 10, description: 'Percent (1-100) for PERCENT, cents for FIXED_AMOUNT' })
  @IsInt()
  @IsPositive()
  value!: number;

  @ApiProperty()
  @IsDateString()
  startsAt!: string;

  @ApiProperty()
  @IsDateString()
  endsAt!: string;

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
