import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class DecideReturnRequestDto {
  @ApiPropertyOptional({ description: 'Shown to the customer, mainly useful on rejection' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
