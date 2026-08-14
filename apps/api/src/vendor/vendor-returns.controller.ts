import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Role, ReturnStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { ReturnsService } from '../returns/returns.service';
import { DecideReturnRequestDto } from '../returns/dto/decide-return-request.dto';
import { VendorMembershipService } from './vendor-membership.service';

@ApiTags('vendor-returns')
@ApiCookieAuth('access_token')
@Controller('vendor/returns')
@UseGuards(JwtAuthGuard)
@Roles(Role.VENDOR)
export class VendorReturnsController {
  constructor(
    private readonly returns: ReturnsService,
    private readonly membership: VendorMembershipService,
  ) {}

  @Get()
  @ApiQuery({ name: 'status', enum: ReturnStatus, required: false })
  @ApiOperation({ summary: "List the caller's vendor's return requests" })
  async list(@CurrentUser() user: JwtPayload, @Query('status') status?: ReturnStatus) {
    const { vendorId } = await this.membership.requireMembership(user.sub);
    return this.returns.listVendor(vendorId, status);
  }

  @Patch(':id/approve')
  @ApiOperation({ summary: 'Approve a return — restores inventory and issues a refund' })
  async approve(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: DecideReturnRequestDto) {
    const { vendorId } = await this.membership.requireMembership(user.sub);
    return this.returns.vendorApprove(vendorId, id, user.sub, dto);
  }

  @Patch(':id/reject')
  @ApiOperation({ summary: 'Reject a return request' })
  async reject(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: DecideReturnRequestDto) {
    const { vendorId } = await this.membership.requireMembership(user.sub);
    return this.returns.vendorReject(vendorId, id, user.sub, dto);
  }
}
