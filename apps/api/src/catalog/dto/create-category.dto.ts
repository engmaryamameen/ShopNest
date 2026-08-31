import { IsString, MinLength, MaxLength, Matches, IsOptional, IsUUID, IsInt, IsBoolean, IsUrl } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsAllowedImageUrl } from '../../common/validators/allowed-image-url';

export class CreateCategoryDto {
  @ApiProperty({ example: 'Electronics' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @ApiPropertyOptional({ example: 'electronics', description: 'Auto-generated from name if omitted' })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: 'slug must be lowercase-kebab-case' })
  @MaxLength(80)
  slug?: string;

  @ApiPropertyOptional({ description: 'Parent category UUID — omit for a root category' })
  @IsOptional()
  @IsUUID()
  parentId?: string;

  // Deliberately no `default:` in the @ApiPropertyOptional metadata below —
  // openapi-typescript treats a schema property with `default` as always-
  // present in the *generated request-body TS type* (defaultNonNullable),
  // which silently makes an actually-optional field required for every
  // caller of `@shopnest/api-client`, even though the OpenAPI `required`
  // array (and this DTO's own `@IsOptional()`) correctly omit it. The
  // service/DB default (0 / true) still applies — this only removes the
  // Swagger-UI hint text, not the behavior.
  @ApiPropertyOptional({ description: 'Sort order among siblings' })
  @IsOptional()
  @IsInt()
  position?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  @IsAllowedImageUrl()
  imageUrl?: string;
}
