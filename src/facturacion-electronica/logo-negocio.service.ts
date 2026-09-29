import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { readFile } from 'fs/promises';
import { join, resolve, sep } from 'path';
import { Negocio } from '../negocios/entities/negocio.entity';
import { PlantillaComprobante } from '../facturacion/entities/plantilla-comprobante.entity';
import { TiendaOnline } from '../tienda-online/entities/tienda-online.entity';
import { TipoComprobante } from '../common/enums/tipo-comprobante.enum';

/**
 * Logo que va en el PDF de factura electrónica — cascada acordada con el usuario
 * (spec 2026-09-28, sección 5): logo del negocio → plantilla FACTURA predeterminada →
 * tienda online → sin logo. Un archivo que ya no existe se saltea, nunca rompe el PDF.
 */
@Injectable()
export class LogoNegocioService {
  private readonly logger = new Logger(LogoNegocioService.name);

  constructor(
    @InjectRepository(Negocio) private readonly negocios: Repository<Negocio>,
    @InjectRepository(PlantillaComprobante) private readonly plantillas: Repository<PlantillaComprobante>,
    @InjectRepository(TiendaOnline) private readonly tiendas: Repository<TiendaOnline>,
  ) {}

  async resolverLogo(negocioId: string): Promise<Buffer | null> {
    const [negocio, plantilla, tienda] = await Promise.all([
      this.negocios.findOne({ where: { id: negocioId } }),
      this.plantillas.findOne({
        where: { negocioId, tipo: TipoComprobante.FACTURA, esPredeterminada: true, activo: true },
      }),
      this.tiendas.findOne({ where: { negocioId } }),
    ]);
    const candidatos = [negocio?.logoUrl, plantilla?.logoUrl, tienda?.logoUrl].filter((u): u is string => !!u);
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
