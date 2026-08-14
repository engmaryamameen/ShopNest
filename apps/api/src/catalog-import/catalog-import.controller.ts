import { Body, Controller, Get, HttpCode, HttpStatus, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Audit } from '../audit/audit.decorator';
import { CatalogImportService } from './catalog-import.service';
import { ImportScopeDto } from './dto/import-scope.dto';

@ApiTags('catalog imports')
@Controller('admin/catalog-imports')
@UseGuards(JwtAuthGuard)
@Roles(Role.ADMIN)
@ApiCookieAuth('access_token')
export class CatalogImportController {
  constructor(private readonly imports: CatalogImportService) {}

  @Post('preview')
  @ApiOperation({ summary: '[Admin] Dry run — see what a DummyJSON sync with this scope would do, without writing anything' })
  preview(@Body() scope: ImportScopeDto) {
    return this.imports.preview(scope);
  }

  @Post('dummy-json')
  @HttpCode(HttpStatus.ACCEPTED)
  @Audit({ action: 'ADMIN_CATALOG_IMPORT_TRIGGER', targetType: 'CatalogImportRun', idSource: 'body:id' })
  @ApiOperation({ summary: '[Admin] Queue a DummyJSON catalog synchronization, optionally scoped' })
  importDummyJson(@Body() scope: ImportScopeDto) {
    return this.imports.enqueueDummyJson(scope);
  }

  @Get()
  @ApiOperation({ summary: '[Admin] List recent catalog import runs' })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  listRuns(@Query('limit', new ParseIntPipe({ optional: true })) limit?: number) {
    return this.imports.listRuns(limit);
  }
}
