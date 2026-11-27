import { OfferPricingDto } from '../../pricing/offer-pricing.dto';
import {
  IsObject,
  IsString,
  IsInt,
  IsPositive,
  IsOptional,
  MinLength,
  MaxLength,
  Matches,
  Min,
  IsUUID,
  IsArray,
  ArrayMaxSize,
  ArrayUnique,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsAllowedImageUrl } from '../../common/validators/allowed-image-url';

export class CreateProductDto extends OfferPricingDto {
  @IsOptional() @IsObject() specifications?: Record<string, string>;
  @IsOptional() @IsString() @MaxLength(120) productType?: string;
  @ApiProperty({ example: 'Wireless Headphones' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({
    example: 'wireless-headphones',
    description: 'Auto-generated from name if omitted',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: 'slug must be lowercase-kebab-case' })
  @MaxLength(200)
  slug?: string;

  @ApiProperty({ example: 'High-quality wireless headphones with ANC.' })
  @IsString()
  @MinLength(10)
  description!: string;

  @ApiProperty({ example: 9999, description: 'Price in USD cents (integer)' })
  @IsInt()
  @IsPositive()
  priceCents!: number;

  @ApiPropertyOptional({ description: 'Original price in cents when the offer is discounted' })
  @IsOptional()
  @IsInt()
  @IsPositive()
  compareAtPriceCents?: number | null;

  @ApiProperty({ example: 50 })
  @IsInt()
  @Min(0)
  stockQuantity!: number;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/img/headphones.jpg' })
  @IsOptional()
  @IsAllowedImageUrl()
  imageUrl?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsAllowedImageUrl({ each: true })
  imageUrls?: string[];

  @ApiProperty({ example: 'uuid-of-category' })
  @IsString()
  categoryId!: string;

  @ApiPropertyOptional({ example: 'uuid-of-brand' })
  @IsOptional()
  @IsUUID()
  brandId?: string | null;
}
