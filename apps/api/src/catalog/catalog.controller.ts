import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiCookieAuth,
  ApiParam,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CatalogService } from './catalog.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductQueryDto } from './dto/product-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('catalog')
@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Post('categories')
  @UseGuards(JwtAuthGuard)
  @Roles(Role.ADMIN)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: '[Admin] Create a category' })
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.catalog.createCategory(dto);
  }

  @Get('categories')
  @ApiOperation({ summary: 'List all categories' })
  listCategories() {
    return this.catalog.listCategories();
  }

  @Patch('categories/:id')
  @UseGuards(JwtAuthGuard)
  @Roles(Role.ADMIN)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: '[Admin] Update a category name/slug' })
  @ApiParam({ name: 'id', description: 'Category UUID' })
  updateCategory(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.catalog.updateCategory(id, dto);
  }

  @Delete('categories/:id')
  @UseGuards(JwtAuthGuard)
  @Roles(Role.ADMIN)
  @ApiCookieAuth('access_token')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '[Admin] Delete a category (rejected if any products reference it)' })
  @ApiParam({ name: 'id', description: 'Category UUID' })
  deleteCategory(@Param('id') id: string) {
    return this.catalog.deleteCategory(id);
  }

  @Post('products')
  @UseGuards(JwtAuthGuard)
  @Roles(Role.ADMIN)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: '[Admin] Create a product' })
  createProduct(@Body() dto: CreateProductDto) {
    return this.catalog.createProduct(dto);
  }

  @Get('admin/products')
  @UseGuards(JwtAuthGuard)
  @Roles(Role.ADMIN)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: '[Admin] List all products including archived' })
  listAllProducts() {
    return this.catalog.listAllProducts();
  }

  @Get('products')
  @ApiOperation({ summary: 'List products (supports full-text search and category filter)' })
  listProducts(@Query() query: ProductQueryDto) {
    return this.catalog.listProducts(query);
  }

  @Get('products/:slug')
  @ApiOperation({ summary: 'Get product by slug' })
  @ApiParam({ name: 'slug', example: 'wireless-headphones' })
  getProductBySlug(@Param('slug') slug: string) {
    return this.catalog.getProductBySlug(slug);
  }

  @Patch('products/:id')
  @UseGuards(JwtAuthGuard)
  @Roles(Role.ADMIN)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: '[Admin] Update a product' })
  updateProduct(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.catalog.updateProduct(id, dto);
  }

  @Delete('products/:id')
  @UseGuards(JwtAuthGuard)
  @Roles(Role.ADMIN)
  @ApiCookieAuth('access_token')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '[Admin] Archive a product (soft-delete; physical deletion is never performed)' })
  archiveProduct(@Param('id') id: string) {
    return this.catalog.archiveProduct(id);
  }
}
