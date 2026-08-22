import { Column, Entity, Index, JoinColumn, JoinTable, ManyToMany, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Categoria } from '../../categorias/entities/categoria.entity';
import { Marca } from '../../marcas/entities/marca.entity';
import { Linea } from '../../lineas/entities/linea.entity';
import { UnidadMedida } from '../../common/enums/unidad-medida.enum';
import { TipoImpuesto } from '../../common/enums/tipo-impuesto.enum';

@Entity('productos')
@Index(['negocioId', 'codigoBarras'], {
  unique: true,
  where: '"codigo_barras" IS NOT NULL',
})
export class Producto extends BaseEntity {
  @Index()
  @Column({ name: 'negocio_id' })
  negocioId: string;

  @ManyToMany(() => Categoria)
  @JoinTable({
    name: 'producto_categorias',
    joinColumn: { name: 'producto_id' },
    inverseJoinColumn: { name: 'categoria_id' },
  })
  categorias: Categoria[];

  @Column({ name: 'marca_id', nullable: true })
  marcaId?: string;

  @ManyToOne(() => Marca, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'marca_id' })
  marca?: Marca;

  @Column({ name: 'linea_id', nullable: true })
  lineaId?: string;

  @ManyToOne(() => Linea, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'linea_id' })
  linea?: Linea;

  @Column()
  nombre: string;

  @Column({ nullable: true })
  descripcion?: string;

  @Column({ nullable: true })
  sku?: string;

  @Column({ name: 'codigo_barras', nullable: true })
  codigoBarras?: string;

  @Column({
    type: 'enum',
    enum: UnidadMedida,
    default: UnidadMedida.UNIDAD,
    name: 'unidad_medida',
  })
  unidadMedida: UnidadMedida;

  @Column({ name: 'precio_venta', type: 'numeric', precision: 12, scale: 2 })
  precioVenta: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  costo: number;

  @Column({
    name: 'tipo_impuesto',
    type: 'enum',
    enum: TipoImpuesto,
    default: TipoImpuesto.GRAVADO,
  })
  tipoImpuesto: TipoImpuesto;

  @Column({
    name: 'porcentaje_impuesto',
    type: 'numeric',
    precision: 5,
    scale: 2,
    default: 0,
  })
  porcentajeImpuesto: number;

  @Column({ name: 'imagen_url', nullable: true })
  imagenUrl?: string;

  @Column({ default: true })
  activo: boolean;
}
