import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { PromotionType } from '@prisma/client';
export class OfferPricingDto {
  @IsOptional() @IsBoolean() taxable?: boolean;
  @IsOptional() @IsBoolean() priceIncludesTax?: boolean;
  @IsOptional() @IsUUID() taxClassId?: string | null;
  @IsOptional() @IsBoolean() discountEnabled?: boolean;
  @IsOptional() @IsEnum(PromotionType) discountType?: PromotionType;
  @IsOptional() @IsInt() @Min(0) @Max(10000000) discountValue?: number;
  @IsOptional() @IsDateString() discountStartsAt?: string | null;
  @IsOptional() @IsDateString() discountEndsAt?: string | null;
}
export function offerPricingData(dto: OfferPricingDto) {
  return {
    ...(dto.taxable !== undefined ? { taxable: dto.taxable } : {}),
    ...(dto.priceIncludesTax !== undefined ? { priceIncludesTax: dto.priceIncludesTax } : {}),
    ...(dto.taxClassId !== undefined ? { taxClassId: dto.taxClassId } : {}),
    ...(dto.discountEnabled !== undefined ? { discountEnabled: dto.discountEnabled } : {}),
    ...(dto.discountType !== undefined ? { discountType: dto.discountType } : {}),
    ...(dto.discountValue !== undefined ? { discountValue: dto.discountValue } : {}),
    ...(dto.discountStartsAt !== undefined
      ? { discountStartsAt: dto.discountStartsAt ? new Date(dto.discountStartsAt) : null }
      : {}),
    ...(dto.discountEndsAt !== undefined
      ? { discountEndsAt: dto.discountEndsAt ? new Date(dto.discountEndsAt) : null }
      : {}),
  };
}
export function validateOfferPricing(
  dto: Omit<OfferPricingDto, 'discountStartsAt' | 'discountEndsAt'> & {
    priceCents?: number;
    discountStartsAt?: Date | string | null;
    discountEndsAt?: Date | string | null;
  },
) {
  const type = dto.discountType ?? 'PERCENT';
  if (type === 'PERCENT' && (dto.discountValue ?? 0) > 100)
    throw new Error('Percentage discount cannot exceed 100');
  if (
    dto.discountEnabled &&
    type === 'FIXED_AMOUNT' &&
    dto.priceCents !== undefined &&
    (dto.discountValue ?? 0) > dto.priceCents
  )
    throw new Error('Discount cannot exceed regular price');
  if (
    dto.discountStartsAt &&
    dto.discountEndsAt &&
    new Date(dto.discountEndsAt) <= new Date(dto.discountStartsAt)
  )
    throw new Error('Discount end must follow its start');
}
