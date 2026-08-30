import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { PromotionsService } from './promotions.service';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { UpdatePromotionDto } from './dto/update-promotion.dto';

@ApiTags('admin-promotions')
@ApiCookieAuth('access_token')
@Controller('admin/promotions')
@UseGuards(JwtAuthGuard)
@Roles(Role.ADMIN)
export class AdminPromotionsController {
  constructor(private readonly promotions: PromotionsService) {}

  @Get()
  @ApiOperation({ summary: '[Admin] List platform-scope promotions' })
  list() {
    return this.promotions.listPlatform();
  }

  @Post()
  @ApiOperation({ summary: '[Admin] Create a platform-scope promotion' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreatePromotionDto) {
    return this.promotions.createPlatform(user.sub, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: '[Admin] Update a platform-scope promotion' })
  update(@Param('id') id: string, @Body() dto: UpdatePromotionDto) {
    return this.promotions.updatePlatform(id, dto);
  }
}
