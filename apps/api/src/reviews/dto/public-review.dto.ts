import { ApiProperty } from '@nestjs/swagger';

export class PublicReviewDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  rating!: number;

  @ApiProperty({ nullable: true })
  title!: string | null;

  @ApiProperty()
  body!: string;

  @ApiProperty()
  createdAt!: Date;
}
