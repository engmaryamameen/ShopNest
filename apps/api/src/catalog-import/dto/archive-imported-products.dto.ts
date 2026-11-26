import { CatalogSource } from '@prisma/client';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsUUID,
  ValidateIf,
} from 'class-validator';

export class ArchiveImportedProductsDto {
  @IsOptional()
  @IsEnum(CatalogSource)
  source?: CatalogSource;

  @IsOptional()
  @IsUUID()
  runId?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  productIds?: string[];

  @ValidateIf(
    (value: ArchiveImportedProductsDto) =>
      !value.source && !value.runId && !value.categoryId && !value.productIds,
  )
  @IsUUID()
  private requireFilter?: string;
}
