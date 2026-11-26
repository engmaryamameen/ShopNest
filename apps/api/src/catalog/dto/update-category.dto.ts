import { OmitType, PartialType, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID, IsUrl, ValidateIf } from 'class-validator';
import { CreateCategoryDto } from './create-category.dto';
import { IsAllowedImageUrl } from '../../common/validators/allowed-image-url';

// `parentId` is carved out of the partial base and redeclared below —
// PartialType's inferred type (`string | undefined`) can't structurally
// widen to accept an explicit `null`, and "move this category to the
// root" needs exactly that: null is a real, distinct request from
// "parentId omitted, leave unchanged".
class UpdateCategoryDtoBase extends PartialType(OmitType(CreateCategoryDto, ['parentId', 'imageUrl'] as const)) {}

export class UpdateCategoryDto extends UpdateCategoryDtoBase {
  @ApiPropertyOptional({ description: 'Parent category UUID, or null to move to root', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  parentId?: string | null;

  @ApiPropertyOptional({ description: 'Category image URL, or null to remove the image', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUrl()
  @IsAllowedImageUrl()
  imageUrl?: string | null;
}
