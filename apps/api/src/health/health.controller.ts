import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { SkipOriginCheck } from '../common/decorators/skip-origin-check.decorator';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @SkipOriginCheck()
  @ApiOperation({ summary: 'Health check — liveness + DB connectivity' })
  async check(): Promise<{ status: string; db: string; timestamp: string }> {
    await this.prisma.$queryRaw`SELECT 1`;
    return {
      status: 'ok',
      db: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
