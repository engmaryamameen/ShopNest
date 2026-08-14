import {
  Controller,
  Get,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiCookieAuth, ApiParam } from '@nestjs/swagger';
import { CartService } from './cart.service';
import { UpsertCartItemDto } from './dto/upsert-cart-item.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';

@ApiTags('cart')
@Controller('cart')
@UseGuards(JwtAuthGuard)
@ApiCookieAuth('access_token')
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  @ApiOperation({ summary: 'Get current user cart with items' })
  getCart(@CurrentUser() user: JwtPayload) {
    return this.cart.getCart(user.sub);
  }

  @Put('items')
  @ApiOperation({ summary: 'Upsert cart item (set quantity; max 10 per listing)' })
  upsertItem(@CurrentUser() user: JwtPayload, @Body() dto: UpsertCartItemDto) {
    return this.cart.upsertItem(user.sub, dto);
  }

  @Delete('items/:vendorOfferId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a listing from cart' })
  @ApiParam({ name: 'vendorOfferId', description: 'UUID of the vendor offer to remove' })
  removeItem(@CurrentUser() user: JwtPayload, @Param('vendorOfferId') vendorOfferId: string) {
    return this.cart.removeItem(user.sub, vendorOfferId);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Clear all items from cart' })
  clearCart(@CurrentUser() user: JwtPayload) {
    return this.cart.clearCart(user.sub);
  }
}
