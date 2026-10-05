import { Column, Entity, Index, JoinColumn, JoinTable, ManyToMany, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Categoria } from '../../categorias/entities/categoria.entity';
import { Marca } from '../../marcas/entities/marca.entity';
import { Linea } from '../../lineas/entities/linea.entity';
import { UnidadMedida } from '../../common/enums/unidad-medida.enum';
import { TipoImpuesto } from '../../common/enums/tipo-impuesto.enum';
import { Auditable } from '../../auditoria/auditable.decorator';
import { ModuloPermiso } from '../../common/enums/modulo-permiso.enum';

@Auditable<Producto>({
  modulo: ModuloPermiso.PRODUCTOS,
  nombre: 'el producto',
  etiqueta: (p) => p.nombre,
  campos: {
    nombre: { label: 'Nombre' },
    descripcion: { label: 'Descripción' },
    sku: { label: 'SKU' },
    codigoBarras: { label: 'Código de barras' },
    unidadMedida: {
      label: 'Unidad de medida',
      formato: 'enum',
      opciones: { KG: 'Kilogramo', MILILITRO: 'Mililitro' },
    },
    precioVenta: { label: 'Precio de venta', formato: 'moneda' },
    costo: { label: 'Costo', formato: 'moneda' },
    tipoImpuesto: { label: 'Tipo de impuesto', formato: 'enum' },
    porcentajeImpuesto: { label: 'Impuesto', formato: 'porcentaje' },
    marcaId: { label: 'Marca', formato: 'relacion', entidad: () => Marca },
    lineaId: { label: 'Línea', formato: 'relacion', entidad: () => Linea },
    categorias: { label: 'Categorías', formato: 'relacionMultiple', entidad: () => Categoria },
    imagenUrl: { label: 'Imagen' },
    activo: { label: 'Activo', formato: 'booleano' },
  },
})
@Entity('productos')
@Index(['negocioId', 'codigoBarras'], {
  unique: true,
  where: '"codigo_barras" IS NOT NULL',
})
@Index(['negocioId', 'sku'], {
  unique: true,
  where: '"sku" IS NOT NULL',
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
