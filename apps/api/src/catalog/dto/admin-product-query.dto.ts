import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CatalogSource, ProductPublishStatus } from '@prisma/client';
export class AdminProductQueryDto {
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsIn(['true', 'false']) importedOnly?: string;
  @IsOptional() @IsEnum(CatalogSource) source?: CatalogSource;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsUUID() brandId?: string;
  @IsOptional() @IsUUID() vendorId?: string;
  @IsOptional() @IsUUID() runId?: string;
  @IsOptional() @IsEnum(ProductPublishStatus) status?: ProductPublishStatus;
  @IsOptional() @IsDateString() since?: string;
  @IsOptional() @IsIn(['newest', 'name', 'price']) sort?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 25;
}
