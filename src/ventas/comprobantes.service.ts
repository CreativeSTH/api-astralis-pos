import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Venta } from './entities/venta.entity';
import { Negocio } from '../negocios/entities/negocio.entity';
import { Sucursal } from '../sucursales/entities/sucursal.entity';
import { PlantillaComprobante, DatosDianPlantilla } from '../facturacion/entities/plantilla-comprobante.entity';
import { TipoComprobante } from '../common/enums/tipo-comprobante.enum';
import { VentasService } from './ventas.service';

export interface ItemComprobante {
  nombre: string;
  cantidad: number;
  subtotal: number;
  /** Valor sin impuesto y monto de impuesto de esta línea — para que el comprobante local (recibo o factura) tenga siempre el IVA discriminado, exigido por el Estatuto Tributario (Art. 617) aunque el negocio no tenga facturación electrónica activa. */
  baseImponible: number;
  impuesto: number;
}

export interface PagoComprobante {
  metodo: string;
  monto: number;
}

export interface ReciboContenido {
  tipo: TipoComprobante;
  negocio: { nombre: string; nit?: string; logoUrl?: string };
  emisor: { nombrePersonaNatural?: string; direccion?: string; telefono?: string };
  numero: string;
  fecha: Date;
  cliente: string;
  items: ItemComprobante[];
  subtotal: number;
  descuento: number;
  impuesto: number;
  total: number;
  pagos: PagoComprobante[];
  mensajeCierre?: string;
  terminos?: string;
  dian?: DatosDianPlantilla;
}

/**
 * Arma el contenido a imprimir para una venta, resolviendo qué plantilla
 * aplica en cascada: la que quedó denormalizada en la venta (fidelidad en
 * reimpresión) → el default vigente de la sucursal → el default del
 * negocio → si nada está configurado, un contenido sintético equivalente
 * al recibo hardcodeado de siempre. Esta última rama es la garantía de
 * que ninguna sucursal sin configurar pierde la capacidad de imprimir.
 */
@Injectable()
export class ComprobantesService {
  constructor(
    @InjectRepository(Negocio)
    private readonly negociosRepository: Repository<Negocio>,
    @InjectRepository(Sucursal)
    private readonly sucursalesRepository: Repository<Sucursal>,
    @InjectRepository(PlantillaComprobante)
    private readonly plantillasRepository: Repository<PlantillaComprobante>,
    private readonly ventasService: VentasService,
  ) {}

  async obtenerContenido(ventaId: string): Promise<ReciboContenido> {
    const venta = await this.ventasService.findOne(ventaId);
    const negocio = await this.negociosRepository.findOneOrFail({ where: { id: venta.negocioId } });
    const plantilla = await this.resolverPlantilla(venta);
    return this.construirContenido(venta, negocio, plantilla);
  }

  private async resolverPlantilla(venta: Venta): Promise<PlantillaComprobante | null> {
    const tipo = venta.tipoComprobanteEmitido ?? TipoComprobante.RECIBO;

    if (venta.plantillaComprobanteId) {
      const propia = await this.plantillasRepository.findOne({
        where: { id: venta.plantillaComprobanteId, negocioId: venta.negocioId, activo: true },
      });
      if (propia) return propia;
    }

    const sucursal = await this.sucursalesRepository.findOne({ where: { id: venta.sucursalId } });
    const idDefaultSucursal =
      tipo === TipoComprobante.FACTURA ? sucursal?.plantillaFacturaDefectoId : sucursal?.plantillaReciboDefectoId;
    if (idDefaultSucursal) {
      const deSucursal = await this.plantillasRepository.findOne({
        where: { id: idDefaultSucursal, negocioId: venta.negocioId, activo: true },
      });
      if (deSucursal) return deSucursal;
    }

    return this.plantillasRepository.findOne({
      where: { negocioId: venta.negocioId, tipo, esPredeterminada: true, activo: true },
    });
  }

  private construirContenido(venta: Venta, negocio: Negocio, plantilla: PlantillaComprobante | null): ReciboContenido {
    const tipo = venta.tipoComprobanteEmitido ?? TipoComprobante.RECIBO;
    const config = plantilla?.configuracion ?? {};

    return {
      tipo,
      negocio: { nombre: negocio.nombre, nit: negocio.nit, logoUrl: plantilla?.logoUrl },
      emisor: {
        nombrePersonaNatural: config.nombrePersonaNatural,
        direccion: config.direccion ?? negocio.direccion,
        telefono: config.telefono ?? negocio.telefono,
      },
      numero: venta.numeroComprobante ?? venta.id.slice(0, 8),
      fecha: venta.createdAt,
      cliente: venta.nombreCliente,
      items: venta.items.map((item) => ({
        nombre: item.nombreProducto,
        cantidad: Number(item.cantidad),
        subtotal: Number(item.subtotal),
        baseImponible: Number(item.baseImponible),
        impuesto: Number(item.impuesto),
      })),
      subtotal: Number(venta.subtotal),
      descuento: Number(venta.descuentoTotal),
      impuesto: Number(venta.impuestoTotal),
      total: Number(venta.total),
      pagos: (venta.pagos ?? []).map((pago) => ({ metodo: pago.metodoPago, monto: Number(pago.monto) })),
      mensajeCierre: config.mensajeCierre,
      terminos: config.terminos,
      dian: tipo === TipoComprobante.FACTURA ? config.dian : undefined,
    };
  }
}
