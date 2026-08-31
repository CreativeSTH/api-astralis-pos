import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

@Entity('paquetes')
@Index('UQ_paquetes_es_paquete_free', ['esPaqueteFree'], {
  unique: true,
  where: '"es_paquete_free" = true',
})
export class Paquete extends BaseEntity {
  @Column()
  nombre: string;

  @Column({ nullable: true })
  descripcion?: string;

  @Column({ name: 'precio_mensual', type: 'numeric', precision: 12, scale: 2 })
  precioMensual: number;

  @Column({ name: 'facturacion_dian_habilitada', default: false })
  facturacionDianHabilitada: boolean;

  @Column({ name: 'documentos_dian_por_mes', default: 0 })
  documentosDianPorMes: number;

  @Column({ name: 'tienda_online_habilitada', default: false })
  tiendaOnlineHabilitada: boolean;

  @Column({ name: 'max_sucursales', default: 0 })
  maxSucursales: number;

  @Column({ name: 'max_usuarios', default: 0 })
  maxUsuarios: number;

  /**
   * A lo sumo una fila del catálogo debería tener esto en true — es el fallback de todo
   * negocio sin otra Suscripcion asignada (ver PaquetesService.asegurarPaqueteFreePorDefecto,
   * consumido por SuscripcionesService en la pieza 2). La invariante la sostiene el índice
   * único parcial `UQ_paquetes_es_paquete_free` (arriba) — un segundo insert/update con
   * esPaqueteFree=true falla con 23505 en vez de dejar dos filas FREE.
   */
  @Column({ name: 'es_paquete_free', default: false })
  esPaqueteFree: boolean;

  @Column({ default: true })
  activo: boolean;
}
