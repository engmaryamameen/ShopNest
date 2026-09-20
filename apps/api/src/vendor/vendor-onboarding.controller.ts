import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role, VendorStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { Audit } from '../audit/audit.decorator';
import { VendorOnboardingService } from './vendor-onboarding.service';
import { VendorAnalyticsService } from './vendor-analytics.service';
import { ApplyVendorDto } from './dto/apply-vendor.dto';
import { UpdateVendorProfileDto } from './dto/update-vendor-profile.dto';

@ApiTags('vendor')
@ApiCookieAuth('access_token')
@Controller('vendor')
@UseGuards(JwtAuthGuard)
export class VendorOnboardingController {
  constructor(
    private readonly onboarding: VendorOnboardingService,
    private readonly analytics: VendorAnalyticsService,
  ) {}

  @Post('apply')
  @ApiOperation({ summary: 'Apply to become a vendor (any authenticated customer)' })
  apply(@CurrentUser() user: JwtPayload, @Body() dto: ApplyVendorDto) {
    return this.onboarding.apply(user.sub, dto);
  }

  @Get('me')
  @ApiOperation({ summary: "Get the caller's vendor application/store, whatever its current status" })
  getMyVendor(@CurrentUser() user: JwtPayload) {
    return this.onboarding.getMyVendor(user.sub);
  }

  @Patch('me')
  @ApiOperation({ summary: "[Vendor owner] Update the store profile — name/description/logo/contact" })
  updateProfile(@CurrentUser() user: JwtPayload, @Body() dto: UpdateVendorProfileDto) {
    return this.onboarding.updateProfile(user.sub, dto);
  }

  @Get('analytics')
  @Roles(Role.VENDOR)
  @ApiOperation({ summary: 'Basic revenue/order/offer aggregates for the caller\'s vendor' })
  getAnalyticsSummary(@CurrentUser() user: JwtPayload) {
    return this.analytics.summary(user.sub);
  }
}

@ApiTags('admin-vendors')
@ApiCookieAuth('access_token')
@Controller('admin/vendors')
@UseGuards(JwtAuthGuard)
@Roles(Role.ADMIN)
export class AdminVendorController {
  constructor(private readonly onboarding: VendorOnboardingService) {}

  @Get()
  @ApiOperation({ summary: '[Admin] List vendors, optionally filtered by status' })
  list(@Query('status') status?: VendorStatus) {
    return this.onboarding.adminList(status);
  }

  @Get(':id')
  @ApiOperation({ summary: '[Admin] Get one vendor with its members' })
  getOne(@Param('id') id: string) {
    return this.onboarding.adminGetOne(id);
  }

  // Three distinct routes, not one generic "PATCH .../status" with a body
  // — approve/reject/suspend are semantically different admin actions
  // (each warrants its own audit action, and its own confirmation copy on
  // the frontend for something this consequential), not interchangeable
  // values of one field.

  @Patch(':id/approve')
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'ADMIN_VENDOR_APPROVE', targetType: 'Vendor' })
  @ApiOperation({ summary: '[Admin] Approve a pending or previously-suspended vendor' })
  approve(@Param('id') id: string, @CurrentUser() admin: JwtPayload) {
    return this.onboarding.adminUpdateStatus(id, VendorStatus.APPROVED, admin.sub);
  }

  @Patch(':id/reject')
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'ADMIN_VENDOR_REJECT', targetType: 'Vendor' })
  @ApiOperation({ summary: '[Admin] Reject a pending vendor application' })
  reject(@Param('id') id: string, @CurrentUser() admin: JwtPayload) {
    return this.onboarding.adminUpdateStatus(id, VendorStatus.REJECTED, admin.sub);
  }

  @Patch(':id/suspend')
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'ADMIN_VENDOR_SUSPEND', targetType: 'Vendor' })
  @ApiOperation({ summary: '[Admin] Suspend an approved vendor' })
  suspend(@Param('id') id: string, @CurrentUser() admin: JwtPayload) {
    return this.onboarding.adminUpdateStatus(id, VendorStatus.SUSPENDED, admin.sub);
  }
}
