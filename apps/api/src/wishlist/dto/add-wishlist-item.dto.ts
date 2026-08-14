import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AddWishlistItemDto {
  @ApiProperty()
  @IsUUID('4')
  productId!: string;
}
