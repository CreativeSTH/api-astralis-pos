import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Venta } from './entities/venta.entity';
import { RegistroPagoCuota } from './entities/registro-pago-cuota.entity';
import { Negocio } from '../negocios/entities/negocio.entity';
import { Sucursal } from '../sucursales/entities/sucursal.entity';
import { TipoComprobanteVenta } from '../common/enums/tipo-comprobante.enum';
import { DocumentoElectronico } from '../facturacion-electronica/entities/documento-electronico.entity';
import { EstadoDocumentoElectronico } from '../facturacion-electronica/entities/estado-documento-electronico.enum';
import {
  FacturaPdfService,
  PROVEEDOR_TECNOLOGICO,
  adquirenteFactura,
  nitConDv,
  textoResolucion,
} from '../facturacion-electronica/factura-pdf.service';
import { fabricanteSoftware } from '../facturacion-electronica/contingencia.util';
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
  emisor: { direccion?: string; telefono?: string };
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
  electronica?: ElectronicaComprobante;
  /** Solo en comprobantes que no son factura electrónica. */
  leyenda?: string;
  /** Solo en el recibo de caja de un abono a crédito. */
  abono?: AbonoComprobante;
}

export const LEYENDA_NO_FACTURA = 'Este documento no es una factura de venta.';
export const TITULO_FACTURA_ELECTRONICA = 'FACTURA ELECTRÓNICA DE VENTA';
/** Res. DIAN 000227 de 2025, art. 1.5.1.2.2.2, num. 1: denominación expresa obligatoria (fase 6a). */
export const TITULO_FACTURA_CONTINGENCIA = 'FACTURA DE VENTA DE TALONARIO O DE PAPEL';
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
  /** Fase 6a: factura de talonario o de papel expedida en contingencia. */
  contingencia: boolean;
  titulo: string;
  /** Una transcripción de contingencia lleva CUDE, no CUFE (anexo técnico v1.9 §11.4). */
  etiquetaCodigo: 'CUFE' | 'CUDE';
  /** Solo en contingencia (requisito num. 13): fabricante del software. El emisor sigue siendo el negocio. */
  fabricanteSoftware: string | null;
}

/** Spec 5: rechazada > sin CUFE todavía > sandbox. null = factura válida, sin encabezado. */
export function encabezadoTirilla(doc: DocumentoElectronico | null): string | null {
  // Fase 6a: la factura de papel es válida desde que se entrega, aunque la transcripción todavía no se
  // haya transmitido o la hayan rechazado.
  if (doc?.periodoContingenciaId) return doc.ambiente === 'SANDBOX' ? 'DOCUMENTO DE PRUEBA — SIN VALIDEZ FISCAL' : null;
  if (doc?.estado === EstadoDocumentoElectronico.RECHAZADO) return 'RECHAZADA POR LA DIAN — SIN VALIDEZ FISCAL';
  if (!doc?.cufe) return 'EN VALIDACIÓN DIAN — REIMPRIMIBLE';
  if (doc.ambiente === 'SANDBOX') return 'DOCUMENTO DE PRUEBA — SIN VALIDEZ FISCAL';
  return null;
}

/**
 * Arma el contenido a imprimir de una venta o de un abono: datos de la venta, formato de impresión
 * del negocio (logo, mensaje de cierre, términos — fase 5b) y dirección/teléfono de la sucursal.
 */
@Injectable()
export class ComprobantesService {
  constructor(
    @InjectRepository(Negocio)
    private readonly negociosRepository: Repository<Negocio>,
    @InjectRepository(Sucursal)
    private readonly sucursalesRepository: Repository<Sucursal>,
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
    const encabezado = await this.encabezado(venta, negocio);
    const electronica =
      venta.tipoComprobanteEmitido === TipoComprobanteVenta.FACTURA_ELECTRONICA ? await this.bloqueElectronico(venta) : undefined;
    return this.construirContenido(venta, negocio, encabezado, electronica);
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
    const encabezado = await this.encabezado(venta, negocio);
    const monto = Number(abono.monto);
    const totalCuotas = venta.cuotas?.length ?? 0;
    const numerico = (valor: unknown) => (valor === null || valor === undefined ? null : Number(valor));

    return {
      tipo: 'RECIBO_CAJA',
      ...encabezado,
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
    const contingencia = !!doc?.periodoContingenciaId;
    // En contingencia el QR existe desde el principio (provisional); en la FE normal, solo con CUFE.
    const conQr = contingencia
      ? !!doc!.qrContenido
      : !!doc?.cufe && !!doc.qrContenido && doc.estado !== EstadoDocumentoElectronico.RECHAZADO;
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
      contingencia,
      titulo: contingencia ? TITULO_FACTURA_CONTINGENCIA : TITULO_FACTURA_ELECTRONICA,
      etiquetaCodigo: contingencia ? 'CUDE' : 'CUFE',
      fabricanteSoftware: contingencia ? fabricanteSoftware() : null,
    };
  }

  /** Logo del negocio (el mismo del PDF) y dirección/teléfono de la sucursal de la venta, con el negocio como respaldo. */
  private async encabezado(venta: Venta, negocio: Negocio): Promise<Pick<ReciboContenido, 'negocio' | 'emisor'>> {
    const sucursal = await this.sucursalesRepository.findOne({ where: { id: venta.sucursalId } });
    return {
      negocio: { nombre: negocio.nombre, nit: negocio.nit, logoUrl: negocio.logoUrl ?? undefined },
      emisor: {
        direccion: sucursal?.direccion ?? negocio.direccion,
        telefono: sucursal?.telefono ?? negocio.telefono,
      },
    };
  }

  private construirContenido(
    venta: Venta,
    negocio: Negocio,
    encabezado: Pick<ReciboContenido, 'negocio' | 'emisor'>,
    electronica?: ElectronicaComprobante,
  ): ReciboContenido {
    const tipo = venta.tipoComprobanteEmitido ?? TipoComprobanteVenta.RECIBO;

    return {
      tipo,
      ...encabezado,
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
      mensajeCierre: negocio.mensajeCierreComprobante ?? undefined,
      terminos: negocio.terminosComprobante ?? undefined,
      electronica,
      leyenda: tipo === TipoComprobanteVenta.FACTURA_ELECTRONICA ? undefined : LEYENDA_NO_FACTURA,
    };
  }
}
