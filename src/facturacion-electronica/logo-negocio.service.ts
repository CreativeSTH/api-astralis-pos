import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { readFile } from 'fs/promises';
import { join, resolve, sep } from 'path';
import { Negocio } from '../negocios/entities/negocio.entity';
import { TiendaOnline } from '../tienda-online/entities/tienda-online.entity';

/**
 * Logo que va en el PDF de factura electrónica — cascada acordada con el usuario
 * (spec 2026-09-28, sección 5; fase 5b de unificación: un solo logo): logo del negocio →
 * tienda online → sin logo. Un archivo que ya no existe se saltea, nunca rompe el PDF.
 */
@Injectable()
export class LogoNegocioService {
  private readonly logger = new Logger(LogoNegocioService.name);

  constructor(
    @InjectRepository(Negocio) private readonly negocios: Repository<Negocio>,
    @InjectRepository(TiendaOnline) private readonly tiendas: Repository<TiendaOnline>,
  ) {}

  async resolverLogo(negocioId: string): Promise<Buffer | null> {
    const [negocio, tienda] = await Promise.all([
      this.negocios.findOne({ where: { id: negocioId } }),
      this.tiendas.findOne({ where: { negocioId } }),
    ]);
    const candidatos = [negocio?.logoUrl, tienda?.logoUrl].filter((u): u is string => !!u);
    for (const url of candidatos) {
      const buffer = await this.leer(url);
      if (buffer) return buffer;
    }
    return null;
  }

  /** Las URLs guardadas son relativas (`/uploads/...`) al directorio que sirve `main.ts`. Solo se leen rutas dentro de `uploads/`. */
  protected async leer(url: string): Promise<Buffer | null> {
    const raiz = join(process.cwd(), 'uploads');
    const ruta = resolve(process.cwd(), `.${url}`);
    if (!ruta.startsWith(raiz + sep)) return null;
    try {
      return await readFile(ruta);
    } catch {
      this.logger.warn(`Logo no encontrado en disco (${url}), se prueba el siguiente de la cascada`);
      return null;
    }
  }
}
