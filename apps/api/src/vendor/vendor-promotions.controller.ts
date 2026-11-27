import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { PromotionsService } from '../promotions/promotions.service';
import { CreatePromotionDto } from '../promotions/dto/create-promotion.dto';
import { UpdatePromotionDto } from '../promotions/dto/update-promotion.dto';
import { VendorMembershipService } from './vendor-membership.service';

@ApiTags('vendor-promotions')
@ApiCookieAuth('access_token')
@Controller('vendor/promotions')
@UseGuards(JwtAuthGuard)
@Roles(Role.VENDOR)
export class VendorPromotionsController {
  constructor(
    private readonly promotions: PromotionsService,
    private readonly membership: VendorMembershipService,
  ) {}

  @Get()
  @ApiOperation({ summary: "List the caller's vendor's promotions" })
  async list(@CurrentUser() user: JwtPayload) {
    const { vendorId } = await this.membership.requireMembership(user.sub);
    return this.promotions.listVendor(vendorId);
  }

  @Post()
  @ApiOperation({ summary: "Create a promotion scoped to the caller's vendor" })
  async create(@CurrentUser() user: JwtPayload, @Body() dto: CreatePromotionDto) {
    const { vendorId } = await this.membership.requireMembership(user.sub);
    return this.promotions.createVendor(vendorId, user.sub, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: "Update one of the caller's vendor's promotions" })
  async update(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: UpdatePromotionDto) {
    const { vendorId } = await this.membership.requireMembership(user.sub);
    return this.promotions.updateVendor(vendorId, id, dto);
  }
}
