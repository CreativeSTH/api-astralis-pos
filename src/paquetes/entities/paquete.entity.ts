import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

@Entity('paquetes')
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
   * consumido por SuscripcionesService en la pieza 2). No hay constraint de unicidad a nivel
   * DB: el único código que lo pone en true es ese método, que es idempotente (busca antes
   * de crear), así que la invariante se sostiene por convención de uso, no por el esquema.
   */
  @Column({ name: 'es_paquete_free', default: false })
  esPaqueteFree: boolean;

  @Column({ default: true })
  activo: boolean;
}
