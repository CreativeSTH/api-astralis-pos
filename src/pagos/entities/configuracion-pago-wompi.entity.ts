import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Auditable } from '../../auditoria/auditable.decorator';
import { ModuloPermiso } from '../../common/enums/modulo-permiso.enum';

@Auditable<ConfiguracionPagoWompi>({
  modulo: ModuloPermiso.PAGOS,
  nombre: 'la configuración de Wompi',
  etiqueta: () => 'Pagos con Wompi',
  campos: {
    llavePublica: { label: 'Llave pública' },
    activo: { label: 'Activo', formato: 'booleano' },
    qrHabilitado: { label: 'QR', formato: 'booleano' },
    nequiHabilitado: { label: 'Nequi', formato: 'booleano' },
    pseHabilitado: { label: 'PSE', formato: 'booleano' },
    tarjetaHabilitado: { label: 'Tarjeta', formato: 'booleano' },
  },
  secretos: {
    llavePrivadaCifrada: 'Llave privada',
    llaveSecretaEventosCifrada: 'Secreto de eventos',
    llaveIntegridadCifrada: 'Llave de integridad',
  },
})
@Entity('configuraciones_pago_wompi')
export class ConfiguracionPagoWompi {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  negocioId: string;

  @Column({ nullable: true })
  llavePublica: string;

  @Column({ nullable: true })
  llavePrivadaCifrada: string;

  @Column({ nullable: true })
  llaveSecretaEventosCifrada: string;

  /**
   * "Llave de integridad" de Wompi (prefijo `prod_integrity_`/`test_integrity_`) — distinta de
   * las 3 anteriores. Wompi la exige para firmar cada `POST /transactions`
   * (`signature = SHA256(reference + amountInCents + currency + llaveIntegridad)`, ver
   * `PagosService.iniciarPago`) — sin ella, Wompi rechaza la transacción con
   * "Firma de integridad requerida no enviada" (confirmado contra el error real de la API).
   */
  @Column({ nullable: true })
  llaveIntegridadCifrada: string;

  @Column({ default: false })
  activo: boolean;

  @Column({ default: true })
  qrHabilitado: boolean;

  @Column({ default: true })
  nequiHabilitado: boolean;

  @Column({ default: true })
  pseHabilitado: boolean;

  @Column({ default: true })
  tarjetaHabilitado: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
