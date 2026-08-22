import { BadRequestException } from '@nestjs/common';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';

const TIPOS_PERMITIDOS = /\.(jpg|jpeg|png|webp)$/i;

/** Config de multer para subir imágenes de producto a disco local. */
export const productoImagenUploadOptions: MulterOptions = {
  storage: diskStorage({
    destination: join(process.cwd(), 'uploads', 'productos'),
    filename: (_req, file, callback) => {
      callback(
        null,
        `${randomUUID()}${extname(file.originalname).toLowerCase()}`,
      );
    },
  }),
  fileFilter: (_req, file, callback) => {
    if (!TIPOS_PERMITIDOS.test(extname(file.originalname))) {
      callback(
        new BadRequestException('Solo se permiten imágenes JPG, PNG o WEBP'),
        false,
      );
      return;
    }
    callback(null, true);
  },
  limits: { fileSize: 3 * 1024 * 1024 },
};
