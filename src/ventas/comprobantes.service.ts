import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Venta } from './entities/venta.entity';
import { RegistroPagoCuota } from './entities/registro-pago-cuota.entity';
import { Negocio } from '../negocios/entities/negocio.entity';
import { Sucursal } from '../sucursales/entities/sucursal.entity';
import { PlantillaComprobante, DatosDianPlantilla } from '../facturacion/entities/plantilla-comprobante.entity';
import { TipoComprobante, TipoComprobanteVenta } from '../common/enums/tipo-comprobante.enum';
import { DocumentoElectronico } from '../facturacion-electronica/entities/documento-electronico.entity';
import { EstadoDocumentoElectronico } from '../facturacion-electronica/entities/estado-documento-electronico.enum';
import {
  FacturaPdfService,
  PROVEEDOR_TECNOLOGICO,
  adquirenteFactura,
  nitConDv,
  textoResolucion,
} from '../facturacion-electronica/factura-pdf.service';
import { Cliente } from '../clientes/entities/cliente.entity';
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
  tipo: TipoComprobanteVenta | 'RECIBO_CAJA';
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
  electronica?: ElectronicaComprobante;
  /** Solo en comprobantes que no son factura electrónica. */
  leyenda?: string;
  /** Solo en el recibo de caja de un abono a crédito. */
  abono?: AbonoComprobante;
}

export const LEYENDA_NO_FACTURA = 'Este documento no es una factura de venta.';
export const LEYENDA_RECIBO_CAJA = 'Recibo de caja: soporte de pago. No es una factura de venta.';

/** Bloque del recibo de caja (spec 4.5): a qué venta y cuota se abonó y cómo quedó el saldo. */
export interface AbonoComprobante {
  numeroCuota: number;
  totalCuotas: number;
  comprobanteVenta: string;
  tipoComprobanteVenta: 'Factura electrónica' | 'Recibo' | 'Factura';
  moraPagada: number;
  /** null en abonos anteriores a los recibos de caja (no hay foto de ese momento). */
  saldoAnterior: number | null;
  saldoNuevo: number | null;
  referenciaPago: string | null;
}

/** Bloque fiscal de una venta FACTURA_ELECTRONICA (spec de unificación de comprobantes, sección 5). */
export interface ElectronicaComprobante {
  /** PENDIENTE si el documento todavía no existe (la emisión es asíncrona). */
  estado: EstadoDocumentoElectronico;
  encabezado: string | null;
  numeroCompleto: string | null;
  fechaEmision: Date | null;
  cufe: string | null;
  qrDataUrl: string | null;
  resolucion: string | null;
  emisor: { razonSocial: string; nitConDv: string; direccion: string } | null;
  adquirente: { nombre: string; identificacion: string };
  formaPago: 'Contado' | 'Crédito';
  proveedorTecnologico: string;
}

/** Spec 5: rechazada > sin CUFE todavía > sandbox. null = factura válida, sin encabezado. */
export function encabezadoTirilla(doc: DocumentoElectronico | null): string | null {
  if (doc?.estado === EstadoDocumentoElectronico.RECHAZADO) return 'RECHAZADA POR LA DIAN — SIN VALIDEZ FISCAL';
  if (!doc?.cufe) return 'EN VALIDACIÓN DIAN — REIMPRIMIBLE';
  if (doc.ambiente === 'SANDBOX') return 'DOCUMENTO DE PRUEBA — SIN VALIDEZ FISCAL';
  return null;
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
    @InjectRepository(DocumentoElectronico)
    private readonly documentosRepository: Repository<DocumentoElectronico>,
    @InjectRepository(Cliente)
    private readonly clientesRepository: Repository<Cliente>,
    @InjectRepository(RegistroPagoCuota)
    private readonly registrosPago: Repository<RegistroPagoCuota>,
    private readonly facturaPdf: FacturaPdfService,
    private readonly ventasService: VentasService,
  ) {}

  async obtenerContenido(ventaId: string): Promise<ReciboContenido> {
    const venta = await this.ventasService.findOne(ventaId);
    const negocio = await this.negociosRepository.findOneOrFail({ where: { id: venta.negocioId } });
    const plantilla = await this.resolverPlantilla(venta);
    const electronica =
      venta.tipoComprobanteEmitido === TipoComprobanteVenta.FACTURA_ELECTRONICA ? await this.bloqueElectronico(venta) : undefined;
    return this.construirContenido(venta, negocio, plantilla, electronica);
  }

  /**
   * Recibo de caja de un abono. `VentasService.findOne` filtra por tenant; su 404 se reemplaza por el
   * mismo del abono inexistente para no revelar el id de la venta de otro negocio.
   */
  async obtenerContenidoAbono(abonoId: string): Promise<ReciboContenido> {
    const abono = await this.registrosPago.findOne({ where: { id: abonoId }, relations: { cuota: true } });
    if (!abono) throw new NotFoundException('Abono no encontrado');
    const venta = await this.ventasService.findOne(abono.cuota.ventaId).catch((error: unknown) => {
      if (error instanceof NotFoundException) throw new NotFoundException('Abono no encontrado');
      throw error;
    });
    const negocio = await this.negociosRepository.findOneOrFail({ where: { id: venta.negocioId } });
    const plantilla = await this.resolverPlantilla(venta);
    const config = plantilla?.configuracion ?? {};
    const monto = Number(abono.monto);
    const totalCuotas = venta.cuotas?.length ?? 0;
    const numerico = (valor: unknown) => (valor === null || valor === undefined ? null : Number(valor));

    return {
      tipo: 'RECIBO_CAJA',
      negocio: { nombre: negocio.nombre, nit: negocio.nit, logoUrl: plantilla?.logoUrl },
      emisor: {
        nombrePersonaNatural: config.nombrePersonaNatural,
        direccion: config.direccion ?? negocio.direccion,
        telefono: config.telefono ?? negocio.telefono,
      },
      numero: abono.numeroRecibo ?? 'Sin numerar',
      fecha: abono.fecha,
      cliente: venta.nombreCliente,
      items: [
        {
          nombre: `Abono cuota ${abono.cuota.numero} de ${totalCuotas}`,
          cantidad: 1,
          subtotal: monto,
          baseImponible: monto,
          impuesto: 0,
        },
      ],
      subtotal: monto,
      descuento: 0,
      impuesto: 0,
      total: monto,
      pagos: [{ metodo: abono.metodoPago, monto }],
      mensajeCierre: '¡Gracias por su pago!',
      leyenda: LEYENDA_RECIBO_CAJA,
      abono: {
        numeroCuota: abono.cuota.numero,
        totalCuotas,
        ...(await this.comprobanteDeVenta(venta)),
        moraPagada: Number(abono.moraPagada ?? 0),
        saldoAnterior: numerico(abono.saldoVentaAnterior),
        saldoNuevo: numerico(abono.saldoVentaNuevo),
        referenciaPago: abono.referenciaPago ?? null,
      },
    };
  }

  private async comprobanteDeVenta(
    venta: Venta,
  ): Promise<Pick<AbonoComprobante, 'comprobanteVenta' | 'tipoComprobanteVenta'>> {
    if (venta.tipoComprobanteEmitido === TipoComprobanteVenta.FACTURA_ELECTRONICA) {
      const doc = await this.documentosRepository.findOne({ where: { ventaId: venta.id, negocioId: venta.negocioId } });
      return { comprobanteVenta: doc?.numeroCompleto ?? 'En validación DIAN', tipoComprobanteVenta: 'Factura electrónica' };
    }
    return {
      comprobanteVenta: venta.numeroComprobante ?? venta.id.slice(0, 8),
      tipoComprobanteVenta: venta.tipoComprobanteEmitido === TipoComprobanteVenta.FACTURA ? 'Factura' : 'Recibo',
    };
  }

  /** Todo sale del snapshot del documento (mismos datos que el PDF — tirilla y PDF nunca se contradicen). */
  private async bloqueElectronico(venta: Venta): Promise<ElectronicaComprobante> {
    const doc = await this.documentosRepository.findOne({ where: { ventaId: venta.id, negocioId: venta.negocioId } });
    const cliente = venta.clienteId
      ? await this.clientesRepository.findOne({ where: { id: venta.clienteId, negocioId: venta.negocioId } })
      : null;
    const conQr = !!doc?.cufe && !!doc.qrContenido && doc.estado !== EstadoDocumentoElectronico.RECHAZADO;
    return {
      estado: doc?.estado ?? EstadoDocumentoElectronico.PENDIENTE,
      encabezado: encabezadoTirilla(doc),
      numeroCompleto: doc?.numeroCompleto ?? null,
      fechaEmision: doc?.fechaEmision ?? null,
      cufe: doc?.cufe ?? null,
      qrDataUrl: conQr ? await this.facturaPdf.generarQrDataUrl(doc!.qrContenido!) : null,
      resolucion: doc?.resolucionNumero ? textoResolucion(doc) : null,
      emisor: doc?.emisorRazonSocial
        ? {
            razonSocial: doc.emisorRazonSocial,
            nitConDv: nitConDv(doc.emisorNit),
            direccion: [doc.emisorDireccion, doc.emisorCiudad].filter(Boolean).join(', '),
          }
        : null,
      adquirente: adquirenteFactura(cliente),
      formaPago: venta.tipoVenta === 'CREDITO' ? 'Crédito' : 'Contado',
      proveedorTecnologico: PROVEEDOR_TECNOLOGICO,
    };
  }

  private async resolverPlantilla(venta: Venta): Promise<PlantillaComprobante | null> {
    // Solo la factura convencional histórica usa plantillas de factura; recibo y factura electrónica usan las de recibo.
    const tipoPlantilla =
      venta.tipoComprobanteEmitido === TipoComprobanteVenta.FACTURA ? TipoComprobante.FACTURA : TipoComprobante.RECIBO;

    if (venta.plantillaComprobanteId) {
      const propia = await this.plantillasRepository.findOne({
        where: { id: venta.plantillaComprobanteId, negocioId: venta.negocioId, activo: true },
      });
      if (propia) return propia;
    }

    const sucursal = await this.sucursalesRepository.findOne({ where: { id: venta.sucursalId } });
    const idDefaultSucursal =
      tipoPlantilla === TipoComprobante.FACTURA ? sucursal?.plantillaFacturaDefectoId : sucursal?.plantillaReciboDefectoId;
    if (idDefaultSucursal) {
      const deSucursal = await this.plantillasRepository.findOne({
        where: { id: idDefaultSucursal, negocioId: venta.negocioId, activo: true },
      });
      if (deSucursal) return deSucursal;
    }

    return this.plantillasRepository.findOne({
      where: { negocioId: venta.negocioId, tipo: tipoPlantilla, esPredeterminada: true, activo: true },
    });
  }

  private construirContenido(
    venta: Venta,
    negocio: Negocio,
    plantilla: PlantillaComprobante | null,
    electronica?: ElectronicaComprobante,
  ): ReciboContenido {
    const tipo = venta.tipoComprobanteEmitido ?? TipoComprobanteVenta.RECIBO;
    const config = plantilla?.configuracion ?? {};

    return {
      tipo,
      negocio: { nombre: negocio.nombre, nit: negocio.nit, logoUrl: plantilla?.logoUrl },
      emisor: {
        nombrePersonaNatural: config.nombrePersonaNatural,
        direccion: config.direccion ?? negocio.direccion,
        telefono: config.telefono ?? negocio.telefono,
      },
      numero: electronica ? (electronica.numeroCompleto ?? 'En validación DIAN') : (venta.numeroComprobante ?? venta.id.slice(0, 8)),
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
      dian: tipo === TipoComprobanteVenta.FACTURA ? config.dian : undefined,
      electronica,
      leyenda: tipo === TipoComprobanteVenta.FACTURA_ELECTRONICA ? undefined : LEYENDA_NO_FACTURA,
    };
  }
}
