import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { DemoCatalogService } from './demo-catalog.service';

@Module({
  imports: [AuthModule],
  controllers: [AdminController],
  providers: [AdminService, DemoCatalogService],
})
export class AdminModule {}
