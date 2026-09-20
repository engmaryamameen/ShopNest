import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

export class LocationSuggestionsQueryDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value))
  @IsString()
  @Length(3, 120)
  query!: string;
}
