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
import { ApiConsumes, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { MEDIA_STORAGE_PROVIDER, type MediaStorageProvider } from './media.types';

// Static, not DI-sourced — same reasoning as the @Throttle() overrides
// elsewhere in this app: decorator arguments run at class-definition
// time, before ConfigService exists.
const MAX_FILE_SIZE_BYTES = parseInt(process.env.MEDIA_MAX_FILE_SIZE_BYTES ?? `${5 * 1024 * 1024}`, 10);
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

@ApiTags('media')
@ApiCookieAuth('access_token')
@Controller('admin/media')
@UseGuards(JwtAuthGuard)
@Roles(Role.ADMIN, Role.VENDOR)
export class MediaController {
  constructor(@Inject(MEDIA_STORAGE_PROVIDER) private readonly storage: MediaStorageProvider) {}

  @Post('upload')
  @ApiOperation({ summary: 'Upload a product image, returns its absolute URL' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE_BYTES } }))
  async upload(
    @UploadedFile(new ParseFilePipe({ fileIsRequired: true }))
    file: Express.Multer.File,
  ) {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException('Only JPEG, PNG, WEBP, or GIF images are allowed');
    }
    return this.storage.upload({
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
    });
  }
}
