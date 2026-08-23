import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Sucursal } from '../../sucursales/entities/sucursal.entity';
import { Usuario } from '../../usuarios/entities/usuario.entity';
import { EstadoTurnoCaja } from '../../common/enums/caja.enum';

export interface ArqueoMetodoPago {
  metodoPago: string;
  montoEsperado: number;
  montoContado: number;
  diferencia: number;
}

@Entity('turnos_caja')
export class TurnoCaja extends BaseEntity {
  @Index()
  @Column({ name: 'negocio_id' })
  negocioId: string;

  @Column({ name: 'sucursal_id' })
  sucursalId: string;

  @ManyToOne(() => Sucursal, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sucursal_id' })
  sucursal: Sucursal;

  @Column({ name: 'usuario_apertura_id' })
  usuarioAperturaId: string;

  @ManyToOne(() => Usuario)
  @JoinColumn({ name: 'usuario_apertura_id' })
  usuarioApertura: Usuario;

  @Column({ name: 'fecha_apertura', type: 'timestamptz' })
  fechaApertura: Date;

  @Column({ name: 'monto_inicial', type: 'numeric', precision: 12, scale: 2 })
  montoInicial: number;

  @Column({ name: 'usuario_cierre_id', nullable: true })
  usuarioCierreId?: string;

  @ManyToOne(() => Usuario, { nullable: true })
  @JoinColumn({ name: 'usuario_cierre_id' })
  usuarioCierre?: Usuario;

  @Column({ name: 'fecha_cierre', type: 'timestamptz', nullable: true })
  fechaCierre?: Date;

  @Column({
    name: 'monto_contado_cierre',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  montoContadoCierre?: number;

  @Column({
    name: 'monto_esperado_cierre',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  montoEsperadoCierre?: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  diferencia?: number;

  /** Desglose del arqueo por método de pago — esperado vs. contado al cierre. */
  @Column({ type: 'jsonb', nullable: true })
  arqueoMetodos?: ArqueoMetodoPago[];

  /** Descuadre ya resuelto (efectivo entregado/cubierto fuera del sistema) — deja de contarse en reportes. */
  @Column({ name: 'descuadre_pagado', default: false })
  descuadrePagado: boolean;

  @Column({
    name: 'monto_pagado_descuadre',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  montoPagadoDescuadre?: number;

  @Column({ name: 'usuario_pago_descuadre_id', nullable: true })
  usuarioPagoDescuadreId?: string;

  @ManyToOne(() => Usuario, { nullable: true })
  @JoinColumn({ name: 'usuario_pago_descuadre_id' })
  usuarioPagoDescuadre?: Usuario;

  @Column({ name: 'fecha_pago_descuadre', type: 'timestamptz', nullable: true })
  fechaPagoDescuadre?: Date;

  @Column({
    type: 'enum',
    enum: EstadoTurnoCaja,
    default: EstadoTurnoCaja.ABIERTO,
  })
  estado: EstadoTurnoCaja;
}
