import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Bodega } from '../../bodegas/entities/bodega.entity';
import { PlantillaTienda } from '../../common/enums/plantilla-tienda.enum';

@Entity('tiendas_online')
export class TiendaOnline extends BaseEntity {
  @Index({ unique: true })
  @Column({ name: 'negocio_id' })
  negocioId: string;

  @Column({ name: 'bodega_id', nullable: true })
  bodegaId: string | null;

  @ManyToOne(() => Bodega, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'bodega_id' })
  bodega: Bodega | null;

  @Column({ default: false })
  activo: boolean;

  @Column({ type: 'enum', enum: PlantillaTienda, nullable: true })
  plantilla: PlantillaTienda | null;

  @Column({ name: 'logo_url', type: 'varchar', nullable: true })
  logoUrl: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  banners: string[];

  @Column({ type: 'text', nullable: true })
  terminos: string | null;

  @Column({ name: 'tratamiento_datos', type: 'text', nullable: true })
  tratamientoDatos: string | null;

  @Column({ name: 'politica_envios', type: 'text', nullable: true })
  politicaEnvios: string | null;
}
