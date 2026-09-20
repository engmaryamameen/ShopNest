import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { CatalogSource } from '@prisma/client';

export class ImportScopeDto {
  @ApiProperty({ enum: CatalogSource, description: 'Which supplier to import from.' })
  @IsEnum(CatalogSource)
  source!: CatalogSource;

  @ApiPropertyOptional({
    type: [String],
    description: 'Only import products in these supplier category names. Omit/empty = no restriction.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categoryScope?: string[];

  @ApiPropertyOptional({ description: 'Import at most this many scoped products.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxRecords?: number;

  @ApiPropertyOptional({ description: 'Only import products with at least this many supplier images.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minImageCount?: number;
}
