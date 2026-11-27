import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { Audit } from '../audit/audit.decorator';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';

@ApiTags('reviews')
@Controller()
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get('products/:slug/reviews')
  @ApiOperation({ summary: 'List published reviews for a product' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  list(
    @Param('slug') slug: string,
    @Query('page', new ParseIntPipe({ optional: true })) page = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit = 10,
  ) {
    return this.reviews.listForProduct(slug, page, limit);
  }

  @Get('products/:slug/reviews/my-eligibility')
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Whether the caller can review this product' })
  myEligibility(@CurrentUser() user: JwtPayload, @Param('slug') slug: string) {
    return this.reviews.getMyEligibility(user.sub, slug);
  }

  @Post('products/:slug/reviews')
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Review a delivered purchase' })
  create(@CurrentUser() user: JwtPayload, @Param('slug') slug: string, @Body() dto: CreateReviewDto) {
    return this.reviews.create(user.sub, slug, dto);
  }

  @Get('admin/reviews')
  @UseGuards(JwtAuthGuard)
  @Roles(Role.ADMIN)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: '[Admin] List reviews for moderation' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, enum: ['PUBLISHED', 'HIDDEN'] })
  adminList(
    @Query('page', new ParseIntPipe({ optional: true })) page = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit = 25,
    @Query('status') status?: 'PUBLISHED' | 'HIDDEN',
  ) {
    return this.reviews.adminList(page, limit, status);
  }

  @Patch('admin/reviews/:id/hide')
  @UseGuards(JwtAuthGuard)
  @Roles(Role.ADMIN)
  @Audit({ action: 'ADMIN_REVIEW_HIDE', targetType: 'Review', idSource: 'param:id' })
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: '[Admin] Hide a review' })
  hide(@Param('id') id: string) {
    return this.reviews.adminSetStatus(id, 'HIDDEN');
  }

  @Patch('admin/reviews/:id/publish')
  @UseGuards(JwtAuthGuard)
  @Roles(Role.ADMIN)
  @Audit({ action: 'ADMIN_REVIEW_PUBLISH', targetType: 'Review', idSource: 'param:id' })
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: '[Admin] Re-publish a hidden review' })
  publish(@Param('id') id: string) {
    return this.reviews.adminSetStatus(id, 'PUBLISHED');
  }
}
