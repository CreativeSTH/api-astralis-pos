import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { EstadoDocumentoElectronico } from './estado-documento-electronico.enum';

export type EstadoCorreoFactura = 'ENVIANDO' | 'ENVIADO' | 'FALLIDO';

@Entity('documentos_electronicos')
@Index('IDX_documentos_electronicos_negocio_created', ['negocioId', 'createdAt'])
// Un número de contingencia no se reutiliza nunca (fase 6a).
@Index('UQ_documentos_electronicos_contingencia_numero', ['negocioId', 'prefijo', 'numero'], {
  unique: true,
  where: '"periodo_contingencia_id" IS NOT NULL',
})
export class DocumentoElectronico extends BaseEntity {
  @Index()
  @Column({ name: 'negocio_id' })
  negocioId: string;

  @Index({ unique: true })
  @Column({ name: 'venta_id' })
  ventaId: string;

  @Column()
  tipo: 'DEE_POS' | 'FACTURA';

  @Column({ type: 'enum', enum: EstadoDocumentoElectronico, default: EstadoDocumentoElectronico.PENDIENTE })
  estado: EstadoDocumentoElectronico;

  @Column({ nullable: true })
  cufe?: string;

  @Column({ nullable: true })
  cude?: string;

  @Column({ name: 'alegra_document_id', nullable: true })
  alegraDocumentId?: string;

  @Column({ default: 0 })
  intentos: number;

  @Column({ name: 'ultimo_intento_en', type: 'timestamptz', nullable: true })
  ultimoIntentoEn?: Date;

  @Column({ name: 'error_mensaje', nullable: true })
  errorMensaje?: string;

  /** Objeto que Alanube devuelve cuando la emisión queda en curso (`isFinal: false`) — se usa para CONSULTAR el resultado después, nunca para reenviar el documento. */
  @Column({ name: 'tracking_reference', type: 'jsonb', nullable: true })
  trackingReference?: Record<string, unknown> | null;

  /** Array completo de `governmentResponse.errorMessages` cuando el documento es rechazado — reemplaza depender solo del mensaje resumido genérico. */
  @Column({ name: 'errores_detalle', type: 'jsonb', nullable: true })
  erroresDetalle?: string[] | null;

  // ── Snapshot de representación gráfica (spec 2026-09-28, sección 3.1) ──
  // Congelado al momento de emitir: la habilitación es mutable (el negocio puede
  // renovar su resolución) y el PDF de una factura vieja nunca debe cambiar.

  @Column({ type: 'int', nullable: true })
  numero?: number;

  @Column({ type: 'varchar', nullable: true })
  prefijo?: string;

  @Column({ name: 'numero_completo', type: 'varchar', nullable: true })
  numeroCompleto?: string;

  @Column({ name: 'fecha_emision', type: 'timestamptz', nullable: true })
  fechaEmision?: Date;

  /** `invoice.qrCodeContent` de Alegra — texto exacto que la DIAN exige dentro del QR, nunca se modifica. */
  @Column({ name: 'qr_contenido', type: 'text', nullable: true })
  qrContenido?: string;

  @Column({ type: 'varchar', nullable: true })
  ambiente?: 'SANDBOX' | 'PRODUCCION';

  @Column({ name: 'resolucion_numero', type: 'varchar', nullable: true })
  resolucionNumero?: string;

  @Column({ name: 'resolucion_fecha_inicio', type: 'date', nullable: true })
  resolucionFechaInicio?: string;

  @Column({ name: 'resolucion_fecha_fin', type: 'date', nullable: true })
  resolucionFechaFin?: string;

  @Column({ name: 'resolucion_rango_desde', type: 'int', nullable: true })
  resolucionRangoDesde?: number;

  @Column({ name: 'resolucion_rango_hasta', type: 'int', nullable: true })
  resolucionRangoHasta?: number;

  @Column({ name: 'emisor_razon_social', type: 'varchar', nullable: true })
  emisorRazonSocial?: string;

  @Column({ name: 'emisor_nit', type: 'varchar', nullable: true })
  emisorNit?: string;

  @Column({ name: 'emisor_direccion', type: 'varchar', nullable: true })
  emisorDireccion?: string;

  @Column({ name: 'emisor_ciudad', type: 'varchar', nullable: true })
  emisorCiudad?: string;

  /** Denormalizado de la venta — `documentos_electronicos.venta_id` es varchar y `ventas.id` uuid, un join directo falla. */
  @Column({ name: 'nombre_cliente', type: 'varchar', nullable: true })
  nombreCliente?: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  total?: number;

  /** Fase 6a: período en que se expidió como factura de talonario o de papel; null = factura electrónica normal. */
  @Index('IDX_documentos_electronicos_periodo_contingencia')
  @Column({ name: 'periodo_contingencia_id', type: 'varchar', nullable: true })
  periodoContingenciaId: string | null;

  /** true = el papel lo escribió el negocio a mano y se registró en AURA después (no lo imprimió AURA). */
  @Column({ name: 'transcrita_de_talonario', default: false })
  transcritaDeTalonario: boolean;

  // ── Fase 7: último envío de la factura al correo del cliente ──

  /** null = nunca se intentó; ENVIANDO = reclamado por el envío automático (evita duplicar webhook + cron). */
  @Column({ name: 'correo_estado', type: 'varchar', nullable: true })
  correoEstado: EstadoCorreoFactura | null;

  @Column({ name: 'correo_destinatario', type: 'varchar', nullable: true })
  correoDestinatario: string | null;

  @Column({ name: 'correo_enviado_en', type: 'timestamptz', nullable: true })
  correoEnviadoEn: Date | null;

  @Column({ name: 'correo_error', type: 'text', nullable: true })
  correoError: string | null;
}
