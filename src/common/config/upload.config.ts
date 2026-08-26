import { BadRequestException } from '@nestjs/common';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';

const TIPOS_PERMITIDOS = /\.(jpg|jpeg|png|webp)$/i;
const TIPOS_DOCUMENTO_PERMITIDOS = /\.(pdf|jpg|jpeg|png|webp)$/i;

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

/** Config de multer para el logo de una plantilla de recibo/factura. Tope más chico que productos/proveedores — es solo un logo. */
export const plantillaLogoUploadOptions: MulterOptions = {
  storage: diskStorage({
    destination: join(process.cwd(), 'uploads', 'plantillas'),
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
  limits: { fileSize: 2 * 1024 * 1024 },
};

/** Config de multer para los documentos de proveedor (RUT, cámara de comercio, certificación bancaria). */
export const proveedorDocumentoUploadOptions: MulterOptions = {
  storage: diskStorage({
    destination: join(process.cwd(), 'uploads', 'proveedores'),
    filename: (_req, file, callback) => {
      callback(
        null,
        `${randomUUID()}${extname(file.originalname).toLowerCase()}`,
      );
    },
  }),
  fileFilter: (_req, file, callback) => {
    if (!TIPOS_DOCUMENTO_PERMITIDOS.test(extname(file.originalname))) {
      callback(
        new BadRequestException(
          'Solo se permiten archivos PDF, JPG, PNG o WEBP',
        ),
        false,
      );
      return;
    }
    callback(null, true);
  },
  limits: { fileSize: 5 * 1024 * 1024 },
};

/** Config de multer para el logo de una tienda online. */
export const tiendaLogoUploadOptions: MulterOptions = {
  storage: diskStorage({
    destination: join(process.cwd(), 'uploads', 'tienda-online', 'logos'),
    filename: (_req, file, callback) => {
      callback(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`);
    },
  }),
  fileFilter: (_req, file, callback) => {
    if (!TIPOS_PERMITIDOS.test(extname(file.originalname))) {
      callback(new BadRequestException('Solo se permiten imágenes JPG, PNG o WEBP'), false);
      return;
    }
    callback(null, true);
  },
  limits: { fileSize: 2 * 1024 * 1024 },
};

/** Config de multer para los banners del carrusel de una tienda online — hasta 4, se suben de a uno. */
export const tiendaBannerUploadOptions: MulterOptions = {
  storage: diskStorage({
    destination: join(process.cwd(), 'uploads', 'tienda-online', 'banners'),
    filename: (_req, file, callback) => {
      callback(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`);
    },
  }),
  fileFilter: (_req, file, callback) => {
    if (!TIPOS_PERMITIDOS.test(extname(file.originalname))) {
      callback(new BadRequestException('Solo se permiten imágenes JPG, PNG o WEBP'), false);
      return;
    }
    callback(null, true);
  },
  limits: { fileSize: 3 * 1024 * 1024 },
};
