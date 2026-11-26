import {
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { OfferPricingDto } from '../../pricing/offer-pricing.dto';
export class ProductVariantDto extends OfferPricingDto {
  @IsOptional() @IsString() @MaxLength(100) sku?: string;
  @IsObject() attributes!: Record<string, string>;
  @IsOptional() @IsUUID() vendorId?: string;
  @IsInt() @Min(1) @Max(10000000) priceCents!: number;
  @IsInt() @Min(0) @Max(10000) stockQuantity!: number;
}
