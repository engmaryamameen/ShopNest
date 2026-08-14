import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { VendorOffersService } from './vendor-offers.service';
import { CreateVendorOfferDto } from './dto/create-vendor-offer.dto';
import { UpdateVendorOfferDto } from './dto/update-vendor-offer.dto';
import { AdjustInventoryDto } from './dto/adjust-inventory.dto';

@ApiTags('vendor-offers')
@ApiCookieAuth('access_token')
@Controller('vendor/offers')
@UseGuards(JwtAuthGuard)
@Roles(Role.VENDOR)
export class VendorOffersController {
  constructor(private readonly offers: VendorOffersService) {}

  @Get()
  @ApiOperation({ summary: "List the caller's vendor's offers" })
  list(@CurrentUser() user: JwtPayload) {
    return this.offers.list(user.sub);
  }

  @Post()
  @ApiOperation({ summary: 'Create an offer against an existing canonical product' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateVendorOfferDto) {
    return this.offers.create(user.sub, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update price/SKU/condition/status of one of your offers' })
  update(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: UpdateVendorOfferDto) {
    return this.offers.update(user.sub, id, dto);
  }

  @Patch(':id/inventory')
  @ApiOperation({ summary: 'Adjust stock by a signed delta (restock or correction), never an absolute set' })
  adjustInventory(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: AdjustInventoryDto) {
    return this.offers.adjustInventory(user.sub, id, dto);
  }

  @Get(':id/inventory')
  @ApiOperation({ summary: 'Recent inventory adjustment history for one offer' })
  inventoryHistory(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.offers.listInventoryHistory(user.sub, id);
  }
}
