import { Column, Entity, Index, JoinTable, ManyToMany } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { TipoPromocion } from '../../common/enums/tipo-promocion.enum';
import { TipoDescuento } from '../../common/enums/tipo-descuento.enum';
import { Sucursal } from '../../sucursales/entities/sucursal.entity';
import { Bodega } from '../../bodegas/entities/bodega.entity';
import { Categoria } from '../../categorias/entities/categoria.entity';
import { Producto } from '../../productos/entities/producto.entity';

/**
 * Cupón y Promoción son el mismo concepto de negocio (descuento con alcance,
 * vigencia y límite de uso) — se diferencian solo por `tipo`: PROMOCION se
 * aplica sola sobre el precio del producto, CUPON requiere que el cajero
 * ingrese `codigo` en el carrito. Compartir la entidad evita duplicar todo
 * el motor de alcance/vigencia/límite dos veces.
 */
@Entity('promociones')
@Index(['negocioId', 'codigo'], { unique: true, where: '"codigo" IS NOT NULL' })
export class Promocion extends BaseEntity {
  @Index()
  @Column({ name: 'negocio_id' })
  negocioId: string;

  @Column({ type: 'enum', enum: TipoPromocion })
  tipo: TipoPromocion;

  @Column()
  nombre: string;

  @Column({ nullable: true })
  descripcion?: string;

  /** Solo si tipo=CUPON — único por negocio (índice parcial arriba, mismo patrón que Producto.sku). */
  @Column({ nullable: true })
  codigo?: string;

  @Column({ name: 'tipo_descuento', type: 'enum', enum: TipoDescuento })
  tipoDescuento: TipoDescuento;

  /** Porcentaje (0-100) o monto fijo, según tipoDescuento. */
  @Column({ type: 'numeric', precision: 12, scale: 2 })
  valor: number;

  /** Solo aplica a CUPON — compra mínima requerida para que el código sea válido. */
  @Column({
    name: 'monto_minimo_compra',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  montoMinimoCompra?: number;

  /** Nula = disponible de inmediato. */
  @Column({ name: 'fecha_inicio', type: 'timestamptz', nullable: true })
  fechaInicio?: Date;

  /** Nula = sin fecha de expiración. */
  @Column({ name: 'fecha_fin', type: 'timestamptz', nullable: true })
  fechaFin?: Date;

  /** Nulo = uso ilimitado. Se cuenta contra `promociones_uso`, no un contador mutable. */
  @Column({ name: 'uso_maximo', nullable: true })
  usoMaximo?: number;

  @Column({ default: true })
  activo: boolean;

  @Column({ name: 'creado_por', nullable: true })
  creadoPor?: string;

  // Alcance: cada relación vacía significa "todas/todos" — solo restringe si tiene filas.
  @ManyToMany(() => Sucursal)
  @JoinTable({
    name: 'promocion_sucursales',
    joinColumn: { name: 'promocion_id' },
    inverseJoinColumn: { name: 'sucursal_id' },
  })
  sucursales: Sucursal[];

  @ManyToMany(() => Bodega)
  @JoinTable({
    name: 'promocion_bodegas',
    joinColumn: { name: 'promocion_id' },
    inverseJoinColumn: { name: 'bodega_id' },
  })
  bodegas: Bodega[];

  @ManyToMany(() => Categoria)
  @JoinTable({
    name: 'promocion_categorias',
    joinColumn: { name: 'promocion_id' },
    inverseJoinColumn: { name: 'categoria_id' },
  })
  categorias: Categoria[];

  @ManyToMany(() => Producto)
  @JoinTable({
    name: 'promocion_productos',
    joinColumn: { name: 'promocion_id' },
    inverseJoinColumn: { name: 'producto_id' },
  })
  productos: Producto[];
}
