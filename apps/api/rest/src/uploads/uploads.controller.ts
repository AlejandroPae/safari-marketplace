import {
  Controller,
  Logger,
  Post,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { UploadsService } from './uploads.service.js';

/**
 * Metadatos de los archivos subidos que se pueden registrar (US-99, DA-2):
 * `mimetype` y `size`. Nunca el `buffer` (el contenido) ni el
 * `originalname`, que puede traer datos personales.
 */
export function describeUploads(files: Array<Express.Multer.File> = []) {
  const detail = files
    .map((f) => `${f.mimetype ?? '?'} ${f.size ?? '?'}B`)
    .join(', ');
  return `${files.length} archivo(s)${detail ? `: ${detail}` : ''}`;
}

@Controller('attachments')
export class UploadsController {
  private readonly logger = new Logger(UploadsController.name);

  constructor(private readonly uploadsService: UploadsService) {}

  @Post()
  @UseInterceptors(FilesInterceptor('attachment[]'))
  uploadFile(@UploadedFiles() attachment: Array<Express.Multer.File>) {
    this.logger.warn(
      `POST /attachments es un stub: no guarda nada (${describeUploads(attachment)})`,
    );
    return [
      {
        id: '883',
        original:
          'https://pickbazarlaravel.s3.ap-southeast-1.amazonaws.com/881/aatik-tasneem-7omHUGhhmZ0-unsplash%402x.png',
        thumbnail:
          'https://pickbazarlaravel.s3.ap-southeast-1.amazonaws.com/881/conversions/aatik-tasneem-7omHUGhhmZ0-unsplash%402x-thumbnail.jpg',
      },
    ];
  }
}
