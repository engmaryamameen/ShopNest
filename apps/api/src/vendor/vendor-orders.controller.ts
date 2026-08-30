import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrderStatus, Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { VendorOrdersService } from './vendor-orders.service';
import { UpdateVendorOrderStatusDto } from './dto/update-vendor-order-status.dto';

@ApiTags('vendor-orders')
@ApiCookieAuth('access_token')
@Controller('vendor/orders')
@UseGuards(JwtAuthGuard)
@Roles(Role.VENDOR)
export class VendorOrdersController {
  constructor(private readonly vendorOrders: VendorOrdersService) {}

  @Get()
  @ApiOperation({ summary: "List the caller's vendor's order fulfilments" })
  list(@CurrentUser() user: JwtPayload, @Query('status') status?: OrderStatus) {
    return this.vendorOrders.list(user.sub, status);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one of your fulfilments with its status history' })
  getOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.vendorOrders.getOne(user.sub, id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Confirm or ship one of your fulfilments' })
  updateStatus(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateVendorOrderStatusDto,
  ) {
    return this.vendorOrders.updateStatus(user.sub, id, dto.status);
  }
}
