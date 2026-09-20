import {
  BadRequestException,
  Controller,
  Inject,
  ParseFilePipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { ApiConsumes, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { MEDIA_STORAGE_PROVIDER, type MediaStorageProvider } from './media.types';
import {
  validateImage,
  ImageTooLargeError,
  ImageTypeMismatchError,
  UnsupportedImageError,
} from './image-validator';

const MAX_FILE_SIZE_BYTES = parseInt(process.env.MEDIA_MAX_FILE_SIZE_BYTES ?? `${5 * 1024 * 1024}`, 10);

@ApiTags('media')
@ApiCookieAuth('access_token')
@Controller('admin/media')
@UseGuards(JwtAuthGuard)
@Roles(Role.ADMIN, Role.VENDOR)
export class MediaController {
  constructor(
    @Inject(MEDIA_STORAGE_PROVIDER) private readonly storage: MediaStorageProvider,
    private readonly config: ConfigService,
  ) {}

  @Post('upload')
  @ApiOperation({ summary: 'Upload a product image, returns its absolute URL' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE_BYTES } }))
  async upload(
    @UploadedFile(new ParseFilePipe({ fileIsRequired: true }))
    file: Express.Multer.File,
  ) {
    const maxDimensionPx = this.config.get<number>('app.mediaMaxImageDimensionPx', 8000);

    let validated;
    try {
      validated = await validateImage(file.buffer, file.mimetype, maxDimensionPx);
    } catch (error) {
      if (
        error instanceof UnsupportedImageError ||
        error instanceof ImageTypeMismatchError ||
        error instanceof ImageTooLargeError
      ) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }

    return this.storage.upload({
      buffer: file.buffer,
      ext: validated.ext,
      mimeType: validated.mimeType,
    });
  }
}
