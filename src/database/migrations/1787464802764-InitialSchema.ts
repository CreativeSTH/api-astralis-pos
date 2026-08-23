import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1787464802764 implements MigrationInterface {
  name = 'InitialSchema1787464802764';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."alertas_tipo_enum" AS ENUM('STOCK_BAJO', 'PRODUCTO_AGOTADO', 'CUOTA_POR_VENCER', 'CUOTA_VENCIDA', 'CLIENTE_LIMITE_CREDITO', 'VENTA_EN_MORA', 'META_VENTAS_NO_ALCANZADA', 'PERSONALIZADA', 'REGLA')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."alertas_severidad_enum" AS ENUM('BAJA', 'MEDIA', 'ALTA', 'CRITICA')`,
    );
    await queryRunner.query(
      `CREATE TABLE "alertas" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "negocio_id" character varying NOT NULL, "tipo" "public"."alertas_tipo_enum" NOT NULL, "severidad" "public"."alertas_severidad_enum" NOT NULL, "referencia_id" character varying, "producto_id" character varying, "regla_id" character varying, "mensaje" character varying NOT NULL, "leida" boolean NOT NULL DEFAULT false, "resuelta" boolean NOT NULL DEFAULT false, "activa" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_b474c4021f8d6e4e13383ef1106" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_daf0e579776d119ff6d5512b11" ON "alertas"  ("negocio_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."negocios_plan_enum" AS ENUM('FREE', 'BASICO', 'PRO')`,
    );
    await queryRunner.query(
      `CREATE TABLE "negocios" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "nombre" character varying NOT NULL, "nit" character varying, "tipo_negocio" character varying, "email" character varying, "telefono" character varying, "direccion" character varying, "plan" "public"."negocios_plan_enum" NOT NULL DEFAULT 'FREE', "activo" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_07babc2e49895ef5292beeb4441" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "sucursales" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "negocio_id" uuid NOT NULL, "nombre" character varying NOT NULL, "direccion" character varying, "telefono" character varying, "meta_ventas_diaria" numeric(12,2), "activo" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_c2232960c9e458db5b18d35eeba" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ad02787ac92193e16f5a62ae05" ON "sucursales"  ("negocio_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "bodegas" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "negocio_id" character varying NOT NULL, "sucursal_id" uuid NOT NULL, "nombre" character varying NOT NULL, "activo" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_b28c5adff6f42b3ae75ff69b604" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5e77fea4c56417aae25a139c87" ON "bodegas"  ("negocio_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."reglas_alerta_tipo_condicion_enum" AS ENUM('LISTA_PEDIDOS_SIN_RESOLVER', 'TURNO_ABIERTO_MUCHO_TIEMPO', 'DESCUADRE_SIN_PAGAR')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."reglas_alerta_severidad_enum" AS ENUM('BAJA', 'MEDIA', 'ALTA', 'CRITICA')`,
    );
    await queryRunner.query(
      `CREATE TABLE "reglas_alerta" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "negocio_id" character varying NOT NULL, "nombre" character varying NOT NULL, "tipo_condicion" "public"."reglas_alerta_tipo_condicion_enum" NOT NULL, "parametros" jsonb NOT NULL, "severidad" "public"."reglas_alerta_severidad_enum" NOT NULL, "activa" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_555e3e40a37c1ba52d9b1d5d002" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_dcd9d817bf24903a64053bf1b8" ON "reglas_alerta"  ("negocio_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."permisos_modulo_enum" AS ENUM('NEGOCIOS', 'SUCURSALES', 'USUARIOS', 'ROLES', 'PRODUCTOS', 'CATEGORIAS', 'MARCAS', 'LINEAS', 'PROVEEDORES', 'BODEGAS', 'INVENTARIO', 'VENTAS', 'CAJA', 'COBROS', 'CLIENTES', 'DOMICILIOS', 'ALERTAS', 'REPORTES', 'METODOS_PAGO')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."permisos_accion_enum" AS ENUM('VER', 'CREAR', 'EDITAR', 'ELIMINAR')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."permisos_tier_enum" AS ENUM('SISTEMA', 'NEGOCIO')`,
    );
    await queryRunner.query(
      `CREATE TABLE "permisos" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "modulo" "public"."permisos_modulo_enum" NOT NULL, "accion" "public"."permisos_accion_enum" NOT NULL, "tier" "public"."permisos_tier_enum" NOT NULL, CONSTRAINT "PK_3127bd9cfeb13ae76186d0d9b38" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_e78ec51d8d22da3f9c1b6e0528" ON "permisos"  ("modulo", "accion") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."roles_tier_enum" AS ENUM('SISTEMA', 'NEGOCIO')`,
    );
    await queryRunner.query(
      `CREATE TABLE "roles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "nombre" character varying NOT NULL, "descripcion" character varying, "tier" "public"."roles_tier_enum" NOT NULL, "negocio_id" uuid, "es_default" boolean NOT NULL DEFAULT false, "activo" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_c1433d71a4838793a49dcad46ab" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f952e5950b98b63b7c48a56095" ON "roles"  ("negocio_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "usuarios" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "negocio_id" uuid, "sucursal_id" uuid, "nombre" character varying NOT NULL, "email" character varying NOT NULL, "password_hash" character varying NOT NULL, "pin_hash" character varying, "rol_id" uuid NOT NULL, "activo" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_d7281c63c176e152e4c531594a8" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_99ec7b56d0e2a4fb96785bbbc3" ON "usuarios"  ("negocio_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_446adfc18b35418aac32ae0b7b" ON "usuarios"  ("email") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_9e519760a660751f4fa21453d3" ON "usuarios"  ("rol_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."turnos_caja_estado_enum" AS ENUM('ABIERTO', 'CERRADO')`,
    );
    await queryRunner.query(
      `CREATE TABLE "turnos_caja" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "negocio_id" character varying NOT NULL, "sucursal_id" uuid NOT NULL, "usuario_apertura_id" uuid NOT NULL, "fecha_apertura" TIMESTAMP WITH TIME ZONE NOT NULL, "monto_inicial" numeric(12,2) NOT NULL, "usuario_cierre_id" uuid, "fecha_cierre" TIMESTAMP WITH TIME ZONE, "monto_contado_cierre" numeric(12,2), "monto_esperado_cierre" numeric(12,2), "diferencia" numeric(12,2), "arqueoMetodos" jsonb, "descuadre_pagado" boolean NOT NULL DEFAULT false, "monto_pagado_descuadre" numeric(12,2), "usuario_pago_descuadre_id" uuid, "fecha_pago_descuadre" TIMESTAMP WITH TIME ZONE, "estado" "public"."turnos_caja_estado_enum" NOT NULL DEFAULT 'ABIERTO', CONSTRAINT "PK_a03721ede79454a666476ef5bc2" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_e3e8a3ce0625274c316207a872" ON "turnos_caja"  ("negocio_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."movimientos_caja_tipo_enum" AS ENUM('VENTA', 'INGRESO', 'EGRESO', 'RETIRO')`,
    );
    await queryRunner.query(
      `CREATE TABLE "movimientos_caja" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "negocio_id" character varying NOT NULL, "turno_id" uuid NOT NULL, "tipo" "public"."movimientos_caja_tipo_enum" NOT NULL, "monto" numeric(12,2) NOT NULL, "concepto" character varying, "metodo_pago" character varying, "venta_id" character varying, "creado_por" character varying, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_a35825837a156d21e0b922fa627" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5c5eb5698206d04cc51a6ee8c9" ON "movimientos_caja"  ("negocio_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "categorias" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "negocio_id" character varying NOT NULL, "nombre" character varying NOT NULL, "categoria_padre_id" uuid, "activo" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_3886a26251605c571c6b4f861fe" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ad1bfbbc3d4d510983678ec9da" ON "categorias"  ("negocio_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "clientes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "negocio_id" character varying NOT NULL, "nombre" character varying NOT NULL, "telefono" character varying NOT NULL, "email" character varying, "direccion" character varying, "documento_identidad" character varying, "limite_credito" numeric(12,2) NOT NULL DEFAULT '0', "deuda_actual" numeric(12,2) NOT NULL DEFAULT '0', "score" integer NOT NULL DEFAULT '100', "bloqueado_por_mora" boolean NOT NULL DEFAULT false, "fecha_bloqueo" TIMESTAMP WITH TIME ZONE, "motivo_bloqueo" character varying, "activo" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_d76bf3571d906e4e86470482c08" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_7c4641e1e95b7f809e4fee1b4f" ON "clientes"  ("negocio_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_e41c0b4fa9f6f7b3358430a673" ON "clientes"  ("negocio_id", "telefono") `,
    );
    await queryRunner.query(
      `CREATE TABLE "direcciones_cliente" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "negocio_id" character varying NOT NULL, "cliente_id" uuid NOT NULL, "etiqueta" character varying, "direccion_linea1" character varying NOT NULL, "direccion_linea2" character varying, "barrio" character varying, "punto_referencia" character varying, "telefono_contacto" character varying, "predeterminada" boolean NOT NULL DEFAULT false, "activo" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_2b40e19d50e567d23f1569dc7ab" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_4e17e836841dfb2218e1b330cf" ON "direcciones_cliente"  ("negocio_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_bca9839f59dcbf0c78c65e4c2b" ON "direcciones_cliente"  ("cliente_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."notas_cliente_tipo_enum" AS ENUM('LLAMADA', 'VISITA', 'ACUERDO', 'COBRANZA', 'OTRO')`,
    );
    await queryRunner.query(
      `CREATE TABLE "notas_cliente" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "cliente_id" uuid NOT NULL, "tipo" "public"."notas_cliente_tipo_enum" NOT NULL, "contenido" character varying NOT NULL, "creada_por" character varying, "fecha" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_571f8348d4abc29b8893c57c270" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c6a8178663efbaa91ecc428de7" ON "notas_cliente"  ("cliente_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "marcas" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "negocio_id" character varying NOT NULL, "nombre" character varying NOT NULL, "marca_padre_id" uuid, "activo" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_0dabf9ed9a15bfb634cb675f7d4" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f181d61268410d951451000fe5" ON "marcas"  ("negocio_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "lineas" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "negocio_id" character varying NOT NULL, "marca_id" uuid NOT NULL, "nombre" character varying NOT NULL, "activo" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_64e22868475535b06fcf0c4c763" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f00129d7869103e4385a4a256a" ON "lineas"  ("negocio_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."productos_unidad_medida_enum" AS ENUM('UNIDAD', 'KG', 'GRAMO', 'LITRO', 'MILILITRO', 'METRO')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."productos_tipo_impuesto_enum" AS ENUM('GRAVADO', 'EXCLUIDO', 'EXENTO')`,
    );
    await queryRunner.query(
      `CREATE TABLE "productos" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "negocio_id" character varying NOT NULL, "marca_id" uuid, "linea_id" uuid, "nombre" character varying NOT NULL, "descripcion" character varying, "sku" character varying, "codigo_barras" character varying, "unidad_medida" "public"."productos_unidad_medida_enum" NOT NULL DEFAULT 'UNIDAD', "precio_venta" numeric(12,2) NOT NULL, "costo" numeric(12,2) NOT NULL DEFAULT '0', "tipo_impuesto" "public"."productos_tipo_impuesto_enum" NOT NULL DEFAULT 'GRAVADO', "porcentaje_impuesto" numeric(5,2) NOT NULL DEFAULT '0', "imagen_url" character varying, "activo" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_04f604609a0949a7f3b43400766" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_3309e14241d31fe71f8463eafe" ON "productos"  ("negocio_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_99f73ca35249e156e2f4923769" ON "productos"  ("negocio_id", "sku") WHERE "sku" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_363ca74332560b8e6e1fd9789d" ON "productos"  ("negocio_id", "codigo_barras") WHERE "codigo_barras" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "venta_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "venta_id" uuid NOT NULL, "producto_id" uuid NOT NULL, "nombre_producto" character varying NOT NULL, "cantidad" numeric(12,2) NOT NULL, "precio_unitario" numeric(12,2) NOT NULL, "descuento" numeric(12,2) NOT NULL DEFAULT '0', "subtotal" numeric(12,2) NOT NULL, "costo_unitario" numeric(12,2) NOT NULL, CONSTRAINT "PK_6506a1ae8240b069cab6a5c7c96" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "venta_pagos" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "venta_id" uuid NOT NULL, "metodo_pago" character varying NOT NULL, "monto" numeric(12,2) NOT NULL, "referencia" character varying, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_7b861698efbf22a3cb01b3fdab5" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "registros_pago_cuota" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "cuota_id" uuid NOT NULL, "monto" numeric(12,2) NOT NULL, "metodo_pago" character varying NOT NULL, "referencia_pago" character varying, "registrado_por" character varying, "notas" character varying, "fecha" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_d8806057fb30866c09debece141" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "cuotas" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "venta_id" uuid NOT NULL, "numero" integer NOT NULL, "monto" numeric(12,2) NOT NULL, "fecha_vencimiento" date NOT NULL, "monto_pagado" numeric(12,2) NOT NULL DEFAULT '0', "saldo_pendiente" numeric(12,2) NOT NULL, "pagada" boolean NOT NULL DEFAULT false, "fecha_pago" TIMESTAMP WITH TIME ZONE, "dias_mora" integer NOT NULL DEFAULT '0', "interes_mora" numeric(5,3) NOT NULL DEFAULT '0', "monto_mora" numeric(12,2) NOT NULL DEFAULT '0', "monto_total_con_mora" numeric(12,2) NOT NULL, CONSTRAINT "PK_fb728d76452f13f226db1943bdb" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_7e1ebaa013ff43f990c8317803" ON "cuotas"  ("venta_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."ventas_tipo_venta_enum" AS ENUM('CONTADO', 'CREDITO')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."ventas_estado_enum" AS ENUM('ACTIVA', 'PARCIALMENTE_PAGADA', 'COMPLETADA', 'VENCIDA', 'EN_MORA', 'CANCELADA')`,
    );
    await queryRunner.query(
      `CREATE TABLE "ventas" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "negocio_id" character varying NOT NULL, "sucursal_id" uuid NOT NULL, "bodega_id" character varying NOT NULL, "turno_id" uuid NOT NULL, "cliente_id" uuid, "nombre_cliente" character varying NOT NULL DEFAULT 'Consumidor final', "tipo_venta" "public"."ventas_tipo_venta_enum" NOT NULL DEFAULT 'CONTADO', "estado" "public"."ventas_estado_enum" NOT NULL DEFAULT 'ACTIVA', "subtotal" numeric(12,2) NOT NULL, "descuento_total" numeric(12,2) NOT NULL DEFAULT '0', "impuesto_total" numeric(12,2) NOT NULL DEFAULT '0', "total" numeric(12,2) NOT NULL, "costo_total" numeric(12,2) NOT NULL, "margen_bruto" numeric(12,2) NOT NULL, "numero_cuotas" integer NOT NULL DEFAULT '0', "tasa_interes_mora" numeric(5,3) NOT NULL DEFAULT '0.1', "cancelada_por" character varying, "motivo_cancelacion" character varying, "fecha_cancelacion" TIMESTAMP WITH TIME ZONE, "creada_por" character varying NOT NULL, CONSTRAINT "PK_b8b73abe8561829c019531d9a2e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_8b2b2cde7281e2782e4a1a2401" ON "ventas"  ("negocio_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."domicilios_estado_enum" AS ENUM('NUEVO', 'EN_CAMINO', 'ENTREGADO', 'CANCELADO')`,
    );
    await queryRunner.query(
      `CREATE TABLE "domicilios" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "negocio_id" character varying NOT NULL, "sucursal_id" uuid NOT NULL, "venta_id" uuid NOT NULL, "cliente_id" uuid, "nombre_cliente" character varying NOT NULL, "direccion_cliente_id" uuid, "direccion_texto" character varying NOT NULL, "punto_referencia" character varying, "telefono_contacto" character varying, "estado" "public"."domicilios_estado_enum" NOT NULL DEFAULT 'NUEVO', "domiciliario_nombre" character varying, "costo_domicilio" numeric(12,2), "motivo_cancelacion" character varying, "fecha_en_camino" TIMESTAMP WITH TIME ZONE, "fecha_entregado" TIMESTAMP WITH TIME ZONE, "fecha_cancelado" TIMESTAMP WITH TIME ZONE, "creado_por" character varying NOT NULL, CONSTRAINT "PK_d77bb6f1d0a3e808622f94277de" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_dbbddfeee3f46a11cd8cca9462" ON "domicilios"  ("negocio_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_f6aca7fe58c5fd118038268792" ON "domicilios"  ("venta_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "inventarios" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "negocio_id" character varying NOT NULL, "producto_id" uuid NOT NULL, "bodega_id" uuid NOT NULL, "cantidad" numeric(12,2) NOT NULL DEFAULT '0', "stock_minimo" numeric(12,2) NOT NULL DEFAULT '0', CONSTRAINT "UQ_5e15b46fb0910e75fbbb10a6649" UNIQUE ("producto_id", "bodega_id"), CONSTRAINT "PK_95497c8cd6a8604110c7a7cbf34" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5385819df13a08b378d759acbf" ON "inventarios"  ("negocio_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."movimientos_inventario_tipo_enum" AS ENUM('ENTRADA', 'SALIDA', 'AJUSTE', 'VENTA', 'DEVOLUCION')`,
    );
    await queryRunner.query(
      `CREATE TABLE "movimientos_inventario" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "negocio_id" character varying NOT NULL, "producto_id" uuid NOT NULL, "bodega_id" uuid NOT NULL, "tipo" "public"."movimientos_inventario_tipo_enum" NOT NULL, "cantidad" numeric(12,2) NOT NULL, "motivo" character varying, "venta_id" character varying, "creado_por" character varying, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_812f6e4f95b017981363c4b9ff9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a629da7f01e6f30fb8dea964c6" ON "movimientos_inventario"  ("negocio_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "proveedores" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "negocio_id" character varying NOT NULL, "nombre" character varying NOT NULL, "nit" character varying, "contacto_nombre" character varying, "telefono" character varying, "email" character varying, "direccion" character varying, "rut_numero" character varying, "rut_documento_url" character varying, "camara_comercio_numero" character varying, "camara_comercio_url" character varying, "certificacion_bancaria_info" character varying, "certificacion_bancaria_url" character varying, "activo" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_1dcf121f19f362fb1b4c0a493a9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c955411273c8e3a731c6e6c271" ON "proveedores"  ("negocio_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."items_pedido_estado_enum" AS ENUM('PENDIENTE', 'PEDIDO', 'INGRESADO')`,
    );
    await queryRunner.query(
      `CREATE TABLE "items_pedido" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "negocio_id" character varying NOT NULL, "producto_id" uuid NOT NULL, "nombre_producto" character varying NOT NULL, "estado" "public"."items_pedido_estado_enum" NOT NULL DEFAULT 'PENDIENTE', "proveedor_id" uuid, "nombre_proveedor" character varying, "costo_unitario" numeric(12,2), "cantidad" numeric(12,2), "fecha_pedido" TIMESTAMP, "fecha_ingreso" TIMESTAMP, "agregado_por" character varying, "pedido_por" character varying, "ingresado_por" character varying, CONSTRAINT "PK_3926c27c228ea78dd527e2d5fc6" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_e86540d764c7d3b6b192c653ae" ON "items_pedido"  ("negocio_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "metodos_pago" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "negocio_id" character varying NOT NULL, "nombre" character varying NOT NULL, "es_efectivo" boolean NOT NULL DEFAULT false, "activo" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_f0a766e84c240f201c5cd87c286" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_77ebfb7709a45d00b8ecaadd1f" ON "metodos_pago"  ("negocio_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "producto_proveedores" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "negocio_id" character varying NOT NULL, "producto_id" uuid NOT NULL, "proveedor_id" uuid NOT NULL, "costo" numeric(12,2) NOT NULL, "referencia" character varying, "activo" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_c30e3c1501b608e82a614e29da3" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_9c68d3406ea878eb854bb6e6ad" ON "producto_proveedores"  ("negocio_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_06f6001be70105e6bc7356f69f" ON "producto_proveedores"  ("negocio_id", "producto_id", "proveedor_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "rol_permisos" ("rol_id" uuid NOT NULL, "permiso_id" uuid NOT NULL, CONSTRAINT "PK_d0cf98bfca05b7f290ea73bd734" PRIMARY KEY ("rol_id", "permiso_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_4d6354d8c6fecd074abd3183f4" ON "rol_permisos"  ("rol_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_25e38115872406619b03e46cce" ON "rol_permisos"  ("permiso_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "producto_categorias" ("producto_id" uuid NOT NULL, "categoria_id" uuid NOT NULL, CONSTRAINT "PK_8ee9d12079c176d64083427ca88" PRIMARY KEY ("producto_id", "categoria_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cc2f5a7f4d3caef26d558ff581" ON "producto_categorias"  ("producto_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_0e59d83b1351c818d2d0209f55" ON "producto_categorias"  ("categoria_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "sucursales" ADD CONSTRAINT "FK_ad02787ac92193e16f5a62ae05f" FOREIGN KEY ("negocio_id") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "bodegas" ADD CONSTRAINT "FK_f90b6577f4962bcce027b156a98" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "roles" ADD CONSTRAINT "FK_f952e5950b98b63b7c48a560952" FOREIGN KEY ("negocio_id") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "usuarios" ADD CONSTRAINT "FK_99ec7b56d0e2a4fb96785bbbc38" FOREIGN KEY ("negocio_id") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "usuarios" ADD CONSTRAINT "FK_7719925fa8ab656620a0f394777" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "usuarios" ADD CONSTRAINT "FK_9e519760a660751f4fa21453d3e" FOREIGN KEY ("rol_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "turnos_caja" ADD CONSTRAINT "FK_7dddc3ec0949744719077338407" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "turnos_caja" ADD CONSTRAINT "FK_353eee20b1ce5f34c303f4b8267" FOREIGN KEY ("usuario_apertura_id") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "turnos_caja" ADD CONSTRAINT "FK_10f1735bdfff608528c1b879a9e" FOREIGN KEY ("usuario_cierre_id") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "turnos_caja" ADD CONSTRAINT "FK_a601316e6bf553a89b8e6767c72" FOREIGN KEY ("usuario_pago_descuadre_id") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "movimientos_caja" ADD CONSTRAINT "FK_c7d88d7f52c6aed186e13453082" FOREIGN KEY ("turno_id") REFERENCES "turnos_caja"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "categorias" ADD CONSTRAINT "FK_8603a6c8a0b33a9072d367fed72" FOREIGN KEY ("categoria_padre_id") REFERENCES "categorias"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "direcciones_cliente" ADD CONSTRAINT "FK_bca9839f59dcbf0c78c65e4c2bc" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notas_cliente" ADD CONSTRAINT "FK_c6a8178663efbaa91ecc428de73" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "marcas" ADD CONSTRAINT "FK_2d4dc1b59e0316c54363db77ede" FOREIGN KEY ("marca_padre_id") REFERENCES "marcas"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "lineas" ADD CONSTRAINT "FK_a573756d4bc14cbf256004279e5" FOREIGN KEY ("marca_id") REFERENCES "marcas"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "productos" ADD CONSTRAINT "FK_db0c18bdd5f379d40ae838e74bd" FOREIGN KEY ("marca_id") REFERENCES "marcas"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "productos" ADD CONSTRAINT "FK_b169f55aaa876389b84e22c110b" FOREIGN KEY ("linea_id") REFERENCES "lineas"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "venta_items" ADD CONSTRAINT "FK_85028d5f15f881b7bb95f61c293" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "venta_items" ADD CONSTRAINT "FK_0c5282608418ad8a536d318219d" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "venta_pagos" ADD CONSTRAINT "FK_6d14801a0c30ebdb8f3fe4554eb" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "registros_pago_cuota" ADD CONSTRAINT "FK_0b68e9b0e8f892e796e5ddcc8ee" FOREIGN KEY ("cuota_id") REFERENCES "cuotas"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "cuotas" ADD CONSTRAINT "FK_7e1ebaa013ff43f990c8317803f" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "ventas" ADD CONSTRAINT "FK_3cbcca0e21a79d4b2b2fcb7c273" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "ventas" ADD CONSTRAINT "FK_adc61de840b86c266fe58ee1b44" FOREIGN KEY ("turno_id") REFERENCES "turnos_caja"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "ventas" ADD CONSTRAINT "FK_6a9b8170c731e6ca2449ea27c52" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "domicilios" ADD CONSTRAINT "FK_030dc9736c7c3367265adc5b56d" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "domicilios" ADD CONSTRAINT "FK_f6aca7fe58c5fd118038268792f" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "domicilios" ADD CONSTRAINT "FK_8738d39c82695c76d40fe64b757" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "domicilios" ADD CONSTRAINT "FK_6591374840d36055ee9538dcead" FOREIGN KEY ("direccion_cliente_id") REFERENCES "direcciones_cliente"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventarios" ADD CONSTRAINT "FK_eef98c8770d9b13a5700874d5b0" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventarios" ADD CONSTRAINT "FK_705faae06deb7749ba850aa604d" FOREIGN KEY ("bodega_id") REFERENCES "bodegas"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "FK_34e722a39e30087fa624b5955d5" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "FK_9aab0c59f35780d7c032f97ba69" FOREIGN KEY ("bodega_id") REFERENCES "bodegas"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "items_pedido" ADD CONSTRAINT "FK_5286a68c2a056ed749942d3d72c" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "items_pedido" ADD CONSTRAINT "FK_037662e2f5d4b4a288391a32598" FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "producto_proveedores" ADD CONSTRAINT "FK_85c684a9b2ce734648a056e958c" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "producto_proveedores" ADD CONSTRAINT "FK_025fa6f7cee88674a669f39f369" FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "rol_permisos" ADD CONSTRAINT "FK_4d6354d8c6fecd074abd3183f40" FOREIGN KEY ("rol_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "rol_permisos" ADD CONSTRAINT "FK_25e38115872406619b03e46cced" FOREIGN KEY ("permiso_id") REFERENCES "permisos"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "producto_categorias" ADD CONSTRAINT "FK_cc2f5a7f4d3caef26d558ff581b" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "producto_categorias" ADD CONSTRAINT "FK_0e59d83b1351c818d2d0209f55f" FOREIGN KEY ("categoria_id") REFERENCES "categorias"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "producto_categorias" DROP CONSTRAINT "FK_0e59d83b1351c818d2d0209f55f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "producto_categorias" DROP CONSTRAINT "FK_cc2f5a7f4d3caef26d558ff581b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "rol_permisos" DROP CONSTRAINT "FK_25e38115872406619b03e46cced"`,
    );
    await queryRunner.query(
      `ALTER TABLE "rol_permisos" DROP CONSTRAINT "FK_4d6354d8c6fecd074abd3183f40"`,
    );
    await queryRunner.query(
      `ALTER TABLE "producto_proveedores" DROP CONSTRAINT "FK_025fa6f7cee88674a669f39f369"`,
    );
    await queryRunner.query(
      `ALTER TABLE "producto_proveedores" DROP CONSTRAINT "FK_85c684a9b2ce734648a056e958c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "items_pedido" DROP CONSTRAINT "FK_037662e2f5d4b4a288391a32598"`,
    );
    await queryRunner.query(
      `ALTER TABLE "items_pedido" DROP CONSTRAINT "FK_5286a68c2a056ed749942d3d72c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "movimientos_inventario" DROP CONSTRAINT "FK_9aab0c59f35780d7c032f97ba69"`,
    );
    await queryRunner.query(
      `ALTER TABLE "movimientos_inventario" DROP CONSTRAINT "FK_34e722a39e30087fa624b5955d5"`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventarios" DROP CONSTRAINT "FK_705faae06deb7749ba850aa604d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventarios" DROP CONSTRAINT "FK_eef98c8770d9b13a5700874d5b0"`,
    );
    await queryRunner.query(
      `ALTER TABLE "domicilios" DROP CONSTRAINT "FK_6591374840d36055ee9538dcead"`,
    );
    await queryRunner.query(
      `ALTER TABLE "domicilios" DROP CONSTRAINT "FK_8738d39c82695c76d40fe64b757"`,
    );
    await queryRunner.query(
      `ALTER TABLE "domicilios" DROP CONSTRAINT "FK_f6aca7fe58c5fd118038268792f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "domicilios" DROP CONSTRAINT "FK_030dc9736c7c3367265adc5b56d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ventas" DROP CONSTRAINT "FK_6a9b8170c731e6ca2449ea27c52"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ventas" DROP CONSTRAINT "FK_adc61de840b86c266fe58ee1b44"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ventas" DROP CONSTRAINT "FK_3cbcca0e21a79d4b2b2fcb7c273"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cuotas" DROP CONSTRAINT "FK_7e1ebaa013ff43f990c8317803f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "registros_pago_cuota" DROP CONSTRAINT "FK_0b68e9b0e8f892e796e5ddcc8ee"`,
    );
    await queryRunner.query(
      `ALTER TABLE "venta_pagos" DROP CONSTRAINT "FK_6d14801a0c30ebdb8f3fe4554eb"`,
    );
    await queryRunner.query(
      `ALTER TABLE "venta_items" DROP CONSTRAINT "FK_0c5282608418ad8a536d318219d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "venta_items" DROP CONSTRAINT "FK_85028d5f15f881b7bb95f61c293"`,
    );
    await queryRunner.query(
      `ALTER TABLE "productos" DROP CONSTRAINT "FK_b169f55aaa876389b84e22c110b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "productos" DROP CONSTRAINT "FK_db0c18bdd5f379d40ae838e74bd"`,
    );
    await queryRunner.query(
      `ALTER TABLE "lineas" DROP CONSTRAINT "FK_a573756d4bc14cbf256004279e5"`,
    );
    await queryRunner.query(
      `ALTER TABLE "marcas" DROP CONSTRAINT "FK_2d4dc1b59e0316c54363db77ede"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notas_cliente" DROP CONSTRAINT "FK_c6a8178663efbaa91ecc428de73"`,
    );
    await queryRunner.query(
      `ALTER TABLE "direcciones_cliente" DROP CONSTRAINT "FK_bca9839f59dcbf0c78c65e4c2bc"`,
    );
    await queryRunner.query(
      `ALTER TABLE "categorias" DROP CONSTRAINT "FK_8603a6c8a0b33a9072d367fed72"`,
    );
    await queryRunner.query(
      `ALTER TABLE "movimientos_caja" DROP CONSTRAINT "FK_c7d88d7f52c6aed186e13453082"`,
    );
    await queryRunner.query(
      `ALTER TABLE "turnos_caja" DROP CONSTRAINT "FK_a601316e6bf553a89b8e6767c72"`,
    );
    await queryRunner.query(
      `ALTER TABLE "turnos_caja" DROP CONSTRAINT "FK_10f1735bdfff608528c1b879a9e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "turnos_caja" DROP CONSTRAINT "FK_353eee20b1ce5f34c303f4b8267"`,
    );
    await queryRunner.query(
      `ALTER TABLE "turnos_caja" DROP CONSTRAINT "FK_7dddc3ec0949744719077338407"`,
    );
    await queryRunner.query(
      `ALTER TABLE "usuarios" DROP CONSTRAINT "FK_9e519760a660751f4fa21453d3e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "usuarios" DROP CONSTRAINT "FK_7719925fa8ab656620a0f394777"`,
    );
    await queryRunner.query(
      `ALTER TABLE "usuarios" DROP CONSTRAINT "FK_99ec7b56d0e2a4fb96785bbbc38"`,
    );
    await queryRunner.query(
      `ALTER TABLE "roles" DROP CONSTRAINT "FK_f952e5950b98b63b7c48a560952"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bodegas" DROP CONSTRAINT "FK_f90b6577f4962bcce027b156a98"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sucursales" DROP CONSTRAINT "FK_ad02787ac92193e16f5a62ae05f"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_0e59d83b1351c818d2d0209f55"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_cc2f5a7f4d3caef26d558ff581"`,
    );
    await queryRunner.query(`DROP TABLE "producto_categorias"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_25e38115872406619b03e46cce"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_4d6354d8c6fecd074abd3183f4"`,
    );
    await queryRunner.query(`DROP TABLE "rol_permisos"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_06f6001be70105e6bc7356f69f"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_9c68d3406ea878eb854bb6e6ad"`,
    );
    await queryRunner.query(`DROP TABLE "producto_proveedores"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_77ebfb7709a45d00b8ecaadd1f"`,
    );
    await queryRunner.query(`DROP TABLE "metodos_pago"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_e86540d764c7d3b6b192c653ae"`,
    );
    await queryRunner.query(`DROP TABLE "items_pedido"`);
    await queryRunner.query(`DROP TYPE "public"."items_pedido_estado_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_c955411273c8e3a731c6e6c271"`,
    );
    await queryRunner.query(`DROP TABLE "proveedores"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_a629da7f01e6f30fb8dea964c6"`,
    );
    await queryRunner.query(`DROP TABLE "movimientos_inventario"`);
    await queryRunner.query(
      `DROP TYPE "public"."movimientos_inventario_tipo_enum"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_5385819df13a08b378d759acbf"`,
    );
    await queryRunner.query(`DROP TABLE "inventarios"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f6aca7fe58c5fd118038268792"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_dbbddfeee3f46a11cd8cca9462"`,
    );
    await queryRunner.query(`DROP TABLE "domicilios"`);
    await queryRunner.query(`DROP TYPE "public"."domicilios_estado_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_8b2b2cde7281e2782e4a1a2401"`,
    );
    await queryRunner.query(`DROP TABLE "ventas"`);
    await queryRunner.query(`DROP TYPE "public"."ventas_estado_enum"`);
    await queryRunner.query(`DROP TYPE "public"."ventas_tipo_venta_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_7e1ebaa013ff43f990c8317803"`,
    );
    await queryRunner.query(`DROP TABLE "cuotas"`);
    await queryRunner.query(`DROP TABLE "registros_pago_cuota"`);
    await queryRunner.query(`DROP TABLE "venta_pagos"`);
    await queryRunner.query(`DROP TABLE "venta_items"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_363ca74332560b8e6e1fd9789d"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_99f73ca35249e156e2f4923769"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_3309e14241d31fe71f8463eafe"`,
    );
    await queryRunner.query(`DROP TABLE "productos"`);
    await queryRunner.query(
      `DROP TYPE "public"."productos_tipo_impuesto_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."productos_unidad_medida_enum"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f00129d7869103e4385a4a256a"`,
    );
    await queryRunner.query(`DROP TABLE "lineas"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f181d61268410d951451000fe5"`,
    );
    await queryRunner.query(`DROP TABLE "marcas"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_c6a8178663efbaa91ecc428de7"`,
    );
    await queryRunner.query(`DROP TABLE "notas_cliente"`);
    await queryRunner.query(`DROP TYPE "public"."notas_cliente_tipo_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_bca9839f59dcbf0c78c65e4c2b"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_4e17e836841dfb2218e1b330cf"`,
    );
    await queryRunner.query(`DROP TABLE "direcciones_cliente"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_e41c0b4fa9f6f7b3358430a673"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_7c4641e1e95b7f809e4fee1b4f"`,
    );
    await queryRunner.query(`DROP TABLE "clientes"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ad1bfbbc3d4d510983678ec9da"`,
    );
    await queryRunner.query(`DROP TABLE "categorias"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_5c5eb5698206d04cc51a6ee8c9"`,
    );
    await queryRunner.query(`DROP TABLE "movimientos_caja"`);
    await queryRunner.query(`DROP TYPE "public"."movimientos_caja_tipo_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_e3e8a3ce0625274c316207a872"`,
    );
    await queryRunner.query(`DROP TABLE "turnos_caja"`);
    await queryRunner.query(`DROP TYPE "public"."turnos_caja_estado_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_9e519760a660751f4fa21453d3"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_446adfc18b35418aac32ae0b7b"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_99ec7b56d0e2a4fb96785bbbc3"`,
    );
    await queryRunner.query(`DROP TABLE "usuarios"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f952e5950b98b63b7c48a56095"`,
    );
    await queryRunner.query(`DROP TABLE "roles"`);
    await queryRunner.query(`DROP TYPE "public"."roles_tier_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_e78ec51d8d22da3f9c1b6e0528"`,
    );
    await queryRunner.query(`DROP TABLE "permisos"`);
    await queryRunner.query(`DROP TYPE "public"."permisos_tier_enum"`);
    await queryRunner.query(`DROP TYPE "public"."permisos_accion_enum"`);
    await queryRunner.query(`DROP TYPE "public"."permisos_modulo_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_dcd9d817bf24903a64053bf1b8"`,
    );
    await queryRunner.query(`DROP TABLE "reglas_alerta"`);
    await queryRunner.query(
      `DROP TYPE "public"."reglas_alerta_severidad_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."reglas_alerta_tipo_condicion_enum"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_5e77fea4c56417aae25a139c87"`,
    );
    await queryRunner.query(`DROP TABLE "bodegas"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ad02787ac92193e16f5a62ae05"`,
    );
    await queryRunner.query(`DROP TABLE "sucursales"`);
    await queryRunner.query(`DROP TABLE "negocios"`);
    await queryRunner.query(`DROP TYPE "public"."negocios_plan_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_daf0e579776d119ff6d5512b11"`,
    );
    await queryRunner.query(`DROP TABLE "alertas"`);
    await queryRunner.query(`DROP TYPE "public"."alertas_severidad_enum"`);
    await queryRunner.query(`DROP TYPE "public"."alertas_tipo_enum"`);
  }
}
