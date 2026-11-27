import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { WishlistService } from './wishlist.service';
import { AddWishlistItemDto } from './dto/add-wishlist-item.dto';

@ApiTags('wishlist')
@ApiCookieAuth('access_token')
@Controller('me/wishlist')
@UseGuards(JwtAuthGuard)
export class WishlistController {
  constructor(private readonly wishlist: WishlistService) {}

  @Get()
  @ApiOperation({ summary: 'List saved products' })
  list(@CurrentUser() user: JwtPayload) {
    return this.wishlist.list(user.sub);
  }

  @Post()
  @ApiOperation({ summary: 'Save a product' })
  add(@CurrentUser() user: JwtPayload, @Body() dto: AddWishlistItemDto) {
    return this.wishlist.add(user.sub, dto.productId);
  }

  @Delete(':productId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a saved product' })
  remove(@CurrentUser() user: JwtPayload, @Param('productId') productId: string) {
    return this.wishlist.remove(user.sub, productId);
  }
}
