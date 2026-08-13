import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { Audit } from '../audit/audit.decorator';
import { UsersService } from './users.service';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { UserSummaryDto } from './dto/user-summary.dto';

@ApiTags('admin-users')
@ApiCookieAuth('access_token')
@Controller('admin/users')
@UseGuards(JwtAuthGuard)
@Roles(Role.ADMIN)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'List customer/admin accounts (paginated)' })
  async list(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ): Promise<{ items: UserSummaryDto[]; total: number; page: number; limit: number }> {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    return this.users.list(pageNum, limitNum);
  }

  @Patch(':id/status')
  @Audit({ action: 'ADMIN_USER_SUSPEND', targetType: 'User', idSource: 'param:id' })
  @ApiOperation({ summary: 'Suspend or reactivate a user account (revokes all sessions on suspend)' })
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateUserStatusDto,
    @CurrentUser() admin: JwtPayload,
  ): Promise<{ id: string; email: string; status: string }> {
    return this.users.updateStatus(id, dto.status, admin.sub);
  }
}
