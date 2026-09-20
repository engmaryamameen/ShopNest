import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { AddressesService } from './addresses.service';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';

@ApiTags('addresses')
@ApiCookieAuth('access_token')
@Controller('me/addresses')
@UseGuards(JwtAuthGuard)
export class AddressesController {
  constructor(private readonly addresses: AddressesService) {}

  @Get()
  @ApiOperation({ summary: 'List saved addresses' })
  list(@CurrentUser() user: JwtPayload) {
    return this.addresses.list(user.sub);
  }

  @Post()
  @ApiOperation({ summary: 'Add an address' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateAddressDto) {
    return this.addresses.create(user.sub, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit an address' })
  update(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: UpdateAddressDto) {
    return this.addresses.update(user.sub, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove an address' })
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.addresses.remove(user.sub, id);
  }

  @Patch(':id/default')
  @ApiOperation({ summary: 'Set as default address' })
  setDefault(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.addresses.setDefault(user.sub, id);
  }
}
