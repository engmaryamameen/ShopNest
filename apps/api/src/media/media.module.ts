import { Module } from '@nestjs/common';
import { MEDIA_STORAGE_PROVIDER } from './media.types';
import { LocalMediaStorageAdapter } from './local-media-storage.adapter';
import { MediaController } from './media.controller';

@Module({
  controllers: [MediaController],
  providers: [
    LocalMediaStorageAdapter,
    { provide: MEDIA_STORAGE_PROVIDER, useExisting: LocalMediaStorageAdapter },
  ],
})
export class MediaModule {}
