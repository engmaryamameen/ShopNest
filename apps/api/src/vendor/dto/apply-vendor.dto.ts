import { IsEmail, IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ApplyVendorDto {
  @ApiProperty({ example: 'Acme Outdoor Co.' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ description: 'Shown on the vendor storefront' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  logoUrl?: string;

  @ApiProperty({ example: 'sales@acme-outdoor.example' })
  @IsEmail()
  contactEmail!: string;
}
