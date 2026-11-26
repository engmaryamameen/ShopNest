import { OfferPricingDto } from '../../pricing/offer-pricing.dto';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  ValidateNested,
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CatalogSource } from '@prisma/client';
import { CreatePromotionDto } from '../../promotions/dto/create-promotion.dto';

class CategoryPriceRule {
  @IsString() @MaxLength(120) category!: string;
  @IsInt() @Min(1) @Max(10000000) minCents!: number;
  @IsInt() @Min(1) @Max(10000000) maxCents!: number;
}
export class ImportScopeDto extends OfferPricingDto {
  @IsOptional() @IsInt() @Min(1) @Max(10) maxImageCount?: number;
  @IsOptional() @IsUUID() promotionId?: string;
  @IsOptional()
  @IsIn(['IMPORT', 'ALL', 'BRANDS', 'CATEGORIES', 'PRODUCT_TYPES', 'VENDORS'])
  promotionTarget?: 'IMPORT' | 'ALL' | 'BRANDS' | 'CATEGORIES' | 'PRODUCT_TYPES' | 'VENDORS';
  @IsOptional() @ValidateNested() @Type(() => CreatePromotionDto) promotion?: CreatePromotionDto;
  @IsOptional() @IsBoolean() rescan?: boolean;
  @IsOptional() @IsUUID() targetCategoryId?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID(undefined, { each: true })
  vendorIds?: string[];
  @IsOptional() @IsIn(['FIXED', 'RANGE', 'CATEGORY']) pricingStrategy?:
    | 'FIXED'
    | 'RANGE'
    | 'CATEGORY';
  @IsOptional() @IsInt() @Min(1) @Max(10000000) minPriceCents?: number;
  @IsOptional() @IsInt() @Min(1) @Max(10000000) maxPriceCents?: number;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CategoryPriceRule)
  categoryPrices?: CategoryPriceRule[];
  @IsOptional() @IsInt() @Min(0) @Max(10000) minStock?: number;
  @IsOptional() @IsInt() @Min(0) @Max(10000) maxStock?: number;
  @IsOptional() @IsInt() @Min(0) @Max(2000) minImageDimension?: number;
  @ApiProperty({ enum: CatalogSource, description: 'Which supplier to import from.' })
  @IsEnum(CatalogSource)
  source!: CatalogSource;

  @ApiPropertyOptional({ description: 'Previously previewed selection.' })
  @IsOptional()
  @IsUUID()
  previewId?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Product identifiers selected from the preview.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  selectedProductIds?: string[];

  @ApiPropertyOptional({
    type: [String],
    description:
      'Only import products in these supplier category names. Omit/empty = no restriction.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  categoryScope?: string[];

  @ApiPropertyOptional({ description: 'Import at most this many scoped products.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  maxRecords?: number;

  @ApiPropertyOptional({ description: 'Optional demo offer price in cents.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000000)
  demoPriceCents?: number;

  @ApiPropertyOptional({ description: 'Optional demo offer quantity.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  demoStockQuantity?: number;

  @ApiPropertyOptional({
    description: 'Only import products with at least this many supplier images.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(20)
  minImageCount?: number;
}
