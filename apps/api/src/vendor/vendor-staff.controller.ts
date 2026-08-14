import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { VendorStaffService } from './vendor-staff.service';
import { InviteVendorStaffDto } from './dto/invite-vendor-staff.dto';
import { AcceptVendorStaffInviteDto } from './dto/accept-vendor-staff-invite.dto';
import { UpdateVendorStaffRoleDto } from './dto/update-vendor-staff-role.dto';

@ApiTags('vendor-staff')
@ApiCookieAuth('access_token')
@Controller('vendor/staff')
@UseGuards(JwtAuthGuard)
export class VendorStaffController {
  constructor(private readonly staff: VendorStaffService) {}

  @Get()
  @Roles(Role.VENDOR)
  @ApiOperation({ summary: '[Owner] List members and pending invites' })
  list(@CurrentUser() user: JwtPayload) {
    return this.staff.list(user.sub);
  }

  @Post('invite')
  @Roles(Role.VENDOR)
  @ApiOperation({ summary: '[Owner] Invite someone to join as staff by email' })
  invite(@CurrentUser() user: JwtPayload, @Body() dto: InviteVendorStaffDto) {
    return this.staff.invite(user.sub, dto);
  }

  // No @Roles(Role.VENDOR) — the accepting user isn't a vendor member yet
  // (that's what this endpoint grants); any authenticated account can hit
  // it, and the invite/email match is the actual authorization check.
  @Post('accept')
  @ApiOperation({ summary: 'Accept a staff invite sent to your account email' })
  accept(@CurrentUser() user: JwtPayload, @Body() dto: AcceptVendorStaffInviteDto) {
    return this.staff.acceptInvite(user.sub, user.email, dto.token);
  }

  @Delete('invites/:inviteId')
  @Roles(Role.VENDOR)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '[Owner] Revoke a pending (not-yet-accepted) invite' })
  revokeInvite(@CurrentUser() user: JwtPayload, @Param('inviteId') inviteId: string) {
    return this.staff.revokeInvite(user.sub, inviteId);
  }

  @Patch(':memberId/role')
  @Roles(Role.VENDOR)
  @ApiOperation({ summary: "[Owner] Change a member's role" })
  updateRole(
    @CurrentUser() user: JwtPayload,
    @Param('memberId') memberId: string,
    @Body() dto: UpdateVendorStaffRoleDto,
  ) {
    return this.staff.updateRole(user.sub, memberId, dto.role);
  }

  @Delete(':memberId')
  @Roles(Role.VENDOR)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "[Owner] Revoke a member's access" })
  revoke(@CurrentUser() user: JwtPayload, @Param('memberId') memberId: string) {
    return this.staff.revoke(user.sub, memberId);
  }
}
