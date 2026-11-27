import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { OfferPricingDto, validateOfferPricing } from './offer-pricing.dto';
import { PromotionsService } from '../promotions/promotions.service';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { SYSTEM_VENDOR_SLUG } from '../catalog/system-vendor.constants';
class TaxClassDto {
  @IsString() @MinLength(2) name!: string;
  @IsInt() @Min(0) @Max(10000) rateBps!: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
class QuoteDto extends OfferPricingDto {
  @IsInt() @Min(0) @Max(10000000) priceCents!: number;
  @IsOptional() @IsUUID() productId?: string;
  @IsOptional() @IsUUID() vendorId?: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsUUID() brandId?: string | null;
  @IsOptional() @IsString() @MaxLength(120) productType?: string;
}
@Controller('admin/pricing')
@UseGuards(JwtAuthGuard)
@Roles(Role.ADMIN)
export class PricingController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly promotions: PromotionsService,
  ) {}
  @Get('tax-classes') @Roles(Role.ADMIN, Role.VENDOR) list() {
    return this.prisma.taxClass.findMany({ orderBy: { name: 'asc' } });
  }
  @Post('tax-classes') create(@Body() dto: TaxClassDto) {
    return this.prisma.taxClass.create({ data: dto });
  }
  @Patch('tax-classes/:id') update(@Param('id') id: string, @Body() dto: TaxClassDto) {
    return this.prisma.taxClass.update({ where: { id }, data: dto });
  }
  @Post('quote') @Roles(Role.ADMIN, Role.VENDOR) async quote(
    @Body() dto: QuoteDto,
    @CurrentUser() user: JwtPayload,
  ) {
    try {
      validateOfferPricing(dto);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    const taxClass = dto.taxClassId
      ? await this.prisma.taxClass.findUniqueOrThrow({ where: { id: dto.taxClassId } })
      : null;
    const product = dto.productId
      ? await this.prisma.product.findUniqueOrThrow({
          where: { id: dto.productId },
          select: { brandId: true, categoryId: true, productType: true },
        })
      : null;
    const membership =
      user.role === Role.VENDOR
        ? await this.prisma.vendorMember.findFirst({
            where: { userId: user.sub },
            select: { vendorId: true },
          })
        : null;
    const vendorId =
      membership?.vendorId ??
      dto.vendorId ??
      (
        await this.prisma.vendor.findUnique({
          where: { slug: SYSTEM_VENDOR_SLUG },
          select: { id: true },
        })
      )?.id ??
      '';
    return this.promotions.quote([
      {
        ...dto,
        brandId: dto.brandId === undefined ? product?.brandId : dto.brandId,
        categoryId: dto.categoryId ?? product?.categoryId,
        productType: dto.productType ?? product?.productType,
        id: 'preview',
        productId: dto.productId ?? '',
        vendorId,
        quantity: 1,
        taxClass,
      },
    ]);
  }
}
