import { Controller, Get, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CatalogImportService } from './catalog-import.service';

@ApiTags('catalog imports')
@Controller('admin/catalog-imports')
@UseGuards(JwtAuthGuard)
@Roles(Role.ADMIN)
@ApiCookieAuth('access_token')
export class CatalogImportController {
  constructor(private readonly imports: CatalogImportService) {}

  @Post('dummy-json')
  @ApiOperation({ summary: '[Admin] Import the current DummyJSON catalog' })
  importDummyJson() {
    return this.imports.importDummyJson();
  }

  @Get()
  @ApiOperation({ summary: '[Admin] List recent catalog import runs' })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  listRuns(@Query('limit', new ParseIntPipe({ optional: true })) limit?: number) {
    return this.imports.listRuns(limit);
  }
}
