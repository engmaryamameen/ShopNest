import { IsIn, IsInt, IsOptional, IsPositive, IsString, IsUUID, Min, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OfferCondition } from '@prisma/client';

export class CreateVendorOfferDto {
  @ApiProperty({ description: 'Canonical product this offer sells — must already exist in the catalog' })
  @IsUUID()
  productId!: string;

  @ApiPropertyOptional({ description: 'Specific variant of the product, if it has any' })
  @IsOptional()
  @IsUUID()
  variantId?: string;

  @ApiProperty({ example: 'ACME-TENT-2P-GRN' })
  @IsString()
  @MinLength(1)
  vendorSku!: string;

  @ApiPropertyOptional({ enum: ['NEW', 'USED', 'REFURBISHED'] })
  @IsOptional()
  @IsIn(['NEW', 'USED', 'REFURBISHED'] satisfies OfferCondition[])
  condition?: OfferCondition;

  @ApiProperty({ example: 8999, description: 'Price in USD cents (integer)' })
  @IsInt()
  @IsPositive()
  priceCents!: number;

  @ApiPropertyOptional({ description: 'Strike-through "was" price — must be greater than priceCents' })
  @IsOptional()
  @IsInt()
  @IsPositive()
  compareAtPriceCents?: number;

  @ApiProperty({ example: 25 })
  @IsInt()
  @Min(0)
  stockQuantity!: number;
}
