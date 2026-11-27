import { IsString, Matches, MaxLength } from 'class-validator';

export class AdminFavoriteDto {
  @IsString()
  @MaxLength(255)
  @Matches(/^\/admin(?:\/[a-zA-Z0-9-]+)*$/, { message: 'Enter a valid admin page path.' })
  path!: string;
}
