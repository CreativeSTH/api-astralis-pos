import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { EstadoDocumentoElectronico } from './estado-documento-electronico.enum';

@Entity('documentos_electronicos')
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
}
