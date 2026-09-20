import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Audit } from '../audit/audit.decorator';
import { AdminService } from './admin.service';
import { CreateAdminDto } from './dto/create-admin.dto';

@ApiTags('admin')
@ApiCookieAuth('access_token')
@Controller('admin')
@UseGuards(JwtAuthGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('dashboard')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[Admin] Platform-wide aggregate counts and recent activity' })
  getDashboard() {
    return this.admin.getDashboardSummary();
  }

  @Get('audit-logs')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[Admin] Paginated audit log, optionally filtered by action or target type' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'action', required: false, type: String })
  @ApiQuery({ name: 'targetType', required: false, type: String })
  listAuditLogs(
    @Query('page') page = '1',
    @Query('limit') limit = '25',
    @Query('action') action?: string,
    @Query('targetType') targetType?: string,
  ) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
    return this.admin.listAuditLogs({ page: pageNum, limit: limitNum, action, targetType });
  }

  // Everything below is SUPER_ADMIN-only — the one platform capability a
  // regular ADMIN must not have (see roles.guard.ts for the one-way
  // ADMIN<-SUPER_ADMIN hierarchy that keeps every OTHER admin route above
  // and elsewhere in the app working unchanged for a SUPER_ADMIN caller).

  @Get('admins')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: '[Super Admin] List every admin/super-admin account' })
  listAdmins() {
    return this.admin.listAdmins();
  }

  @Post('admins')
  @Roles(Role.SUPER_ADMIN)
  @Audit({ action: 'ADMIN_ADMIN_CREATE', targetType: 'User', idSource: 'body:id' })
  @ApiOperation({ summary: '[Super Admin] Create a new admin account — a password-reset email is sent, never a known password' })
  createAdmin(@Body() dto: CreateAdminDto) {
    return this.admin.createAdmin(dto.email);
  }
}
