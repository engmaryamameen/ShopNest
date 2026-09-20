import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { WishlistService } from './wishlist.service';
import { WishlistController } from './wishlist.controller';

@Module({
  imports: [CatalogModule],
  controllers: [WishlistController],
  providers: [WishlistService],
})
export class WishlistModule {}
