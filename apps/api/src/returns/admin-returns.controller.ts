import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Role, ReturnStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { ReturnsService } from './returns.service';
import { DecideReturnRequestDto } from './dto/decide-return-request.dto';

@ApiTags('admin-returns')
@ApiCookieAuth('access_token')
@Controller('admin/returns')
@UseGuards(JwtAuthGuard)
@Roles(Role.ADMIN)
export class AdminReturnsController {
  constructor(private readonly returns: ReturnsService) {}

  @Get()
  @ApiQuery({ name: 'status', enum: ReturnStatus, required: false })
  @ApiOperation({ summary: '[Admin] List return requests, optionally filtered by status' })
  list(@Query('status') status?: ReturnStatus) {
    return this.returns.listAdmin(status);
  }

  @Patch(':id/approve')
  @ApiOperation({ summary: '[Admin] Approve a return — restores inventory and issues a refund' })
  approve(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: DecideReturnRequestDto) {
    return this.returns.adminApprove(user.sub, id, dto);
  }

  @Patch(':id/reject')
  @ApiOperation({ summary: '[Admin] Reject a return request' })
  reject(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: DecideReturnRequestDto) {
    return this.returns.adminReject(user.sub, id, dto);
  }
}
