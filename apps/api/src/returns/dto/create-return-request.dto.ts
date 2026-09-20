import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ReturnReason } from '@prisma/client';

const REASONS: ReturnReason[] = ['DEFECTIVE', 'NOT_AS_DESCRIBED', 'NO_LONGER_NEEDED', 'WRONG_ITEM', 'OTHER'];

export class CreateReturnRequestDto {
  @ApiProperty({ enum: REASONS })
  @IsIn(REASONS)
  reason!: ReturnReason;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
