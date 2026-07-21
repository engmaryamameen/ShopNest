import { SetMetadata } from '@nestjs/common';

export const SKIP_ORIGIN_CHECK_KEY = 'skipOriginCheck';
export const SkipOriginCheck = (): ReturnType<typeof SetMetadata> =>
  SetMetadata(SKIP_ORIGIN_CHECK_KEY, true);
