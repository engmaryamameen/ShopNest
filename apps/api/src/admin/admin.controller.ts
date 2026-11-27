import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Audit } from '../audit/audit.decorator';
import { AdminService } from './admin.service';
import { CreateAdminDto } from './dto/create-admin.dto';
import { DemoCatalogService } from './demo-catalog.service';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { AdminFavoriteDto } from './dto/admin-favorite.dto';

@ApiTags('admin')
@ApiCookieAuth('access_token')
@Controller('admin')
@UseGuards(JwtAuthGuard)
export class AdminController {
  constructor(private readonly admin: AdminService, private readonly demoCatalog: DemoCatalogService, private readonly prisma: PrismaService) {}

  @Get('favorites')
  @Roles(Role.ADMIN)
  async listFavorites(@CurrentUser() user: JwtPayload): Promise<string[]> {
    const favorites = await this.prisma.adminFavorite.findMany({ where: { userId: user.sub }, orderBy: { createdAt: 'asc' }, select: { path: true } });
    return favorites.map((favorite) => favorite.path);
  }

  @Put('favorites')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async addFavorite(@CurrentUser() user: JwtPayload, @Body() dto: AdminFavoriteDto): Promise<void> {
    await this.prisma.adminFavorite.upsert({ where: { userId_path: { userId: user.sub, path: dto.path } }, create: { userId: user.sub, path: dto.path }, update: {} });
  }

  @Delete('favorites')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeFavorite(@CurrentUser() user: JwtPayload, @Body() dto: AdminFavoriteDto): Promise<void> {
    await this.prisma.adminFavorite.deleteMany({ where: { userId: user.sub, path: dto.path } });
  }

  @Post('demo-catalog')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[Admin] Add the fictional demo catalog in an enabled development environment' })
  addDemoCatalog() {
    return this.demoCatalog.apply();
  }

  @Get('dashboard')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[Admin] Platform-wide aggregate counts and recent activity' })
  getDashboard(@Query('range') range?: string, @Query('timezone') timezone?: string) {
    return this.admin.getDashboardSummary(30, range, timezone);
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
