import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiCookieAuth, ApiQuery } from '@nestjs/swagger';
import { OrderStatus, Role } from '@prisma/client';
import { OrdersService } from './orders.service';
import { CheckoutDto } from './dto/checkout.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';

@ApiTags('orders')
@Controller()
@UseGuards(JwtAuthGuard)
@ApiCookieAuth('access_token')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}


  @Post('orders/checkout')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Checkout — atomically create order from cart (idempotent)' })
  checkout(@CurrentUser() user: JwtPayload, @Body() dto: CheckoutDto) {
    return this.orders.checkout(user.sub, dto);
  }

  @Get('orders')
  @ApiOperation({ summary: 'List current user orders' })
  listMyOrders(@CurrentUser() user: JwtPayload) {
    return this.orders.listMyOrders(user.sub);
  }

  @Get('orders/:id')
  @ApiOperation({ summary: 'Get a specific order (must belong to current user)' })
  getMyOrder(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.orders.getMyOrder(user.sub, id);
  }

  @Patch('orders/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a PENDING order (customer — only while PENDING)' })
  cancelMyOrder(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.orders.cancelMyOrder(user.sub, id);
  }


  @Get('admin/orders')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[Admin] List all orders, optionally filtered by status' })
  @ApiQuery({ name: 'status', enum: OrderStatus, required: false })
  adminListOrders(@Query('status') status?: OrderStatus) {
    return this.orders.adminListOrders(status);
  }

  @Get('admin/orders/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[Admin] Get any order by ID (includes customer email)' })
  adminGetOrder(@Param('id') id: string) {
    return this.orders.adminGetOrder(id);
  }

  @Patch('admin/orders/:id/status')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[Admin] Advance order through state machine' })
  adminUpdateOrderStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
    @CurrentUser() admin: JwtPayload,
  ) {
    return this.orders.adminUpdateOrderStatus(id, dto, admin.sub);
  }
}
