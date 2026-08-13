import { ApiProperty } from '@nestjs/swagger';

export class SessionDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ nullable: true, example: 'Chrome on macOS' })
  label!: string | null;

  @ApiProperty({ nullable: true })
  userAgent!: string | null;

  @ApiProperty({ nullable: true })
  ipAddress!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  lastSeenAt!: Date;

  @ApiProperty({ description: 'Whether this is the session making the current request' })
  isCurrent!: boolean;
}
