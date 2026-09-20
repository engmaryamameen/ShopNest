import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { ReturnsService } from './returns.service';
import { CreateReturnRequestDto } from './dto/create-return-request.dto';

@ApiTags('returns')
@ApiCookieAuth('access_token')
@Controller('orders/items')
@UseGuards(JwtAuthGuard)
export class OrderReturnsController {
  constructor(private readonly returns: ReturnsService) {}

  @Post(':orderItemId/returns')
  @ApiOperation({ summary: 'Request a return for a delivered order item' })
  request(@CurrentUser() user: JwtPayload, @Param('orderItemId') orderItemId: string, @Body() dto: CreateReturnRequestDto) {
    return this.returns.request(user.sub, orderItemId, dto);
  }
}
