# CLAUDE.md

Backend **NestJS** + **PostgreSQL** (TypeORM) para un sistema POS multi-negocio genérico. Documento completo de arquitectura y modelo de datos: [`../docs/ARQUITECTURA.md`](../docs/ARQUITECTURA.md) — leerlo antes de tocar este código.

## Comandos

```bash
docker compose up -d postgres   # Levanta Postgres (puerto 5433, ver .env)
npm run seed                    # Crea el primer usuario SUPER_ADMIN
npm run start:dev               # Desarrollo con hot-reload
npm run build                   # Compilar para producción
npm test                        # Tests unitarios
npm run lint                    # ESLint con auto-fix
npm run migration:generate -- src/database/migrations/NombreMigracion   # Genera una migración a partir del diff de entidades
npm run migration:run           # Aplica las migraciones pendientes
```

API en `http://localhost:3000/api`, Swagger en `http://localhost:3000/docs`.

## Migraciones

En desarrollo se sigue usando `synchronize` (activo salvo `NODE_ENV=production`, `app.module.ts`) — no hace falta correr migraciones a mano día a día. `src/database/data-source.ts` es una instancia standalone de `DataSource` (misma config de conexión que `app.module.ts`, pero sin pasar por el contenedor de Nest) que usa el CLI de TypeORM para generar/correr migraciones — necesaria porque el CLI evalúa este archivo directo con ts-node, sin `TypeOrmModule.forRootAsync`/`autoLoadEntities`. **Antes del primer arranque contra una base de datos de producción nueva, hay que correr `npm run migration:run` una vez** — si no, el backend arranca pero no existe ni una tabla. Cuando una migración agrega un valor nuevo a `ModuloPermiso` (ver `common/enums/modulo-permiso.enum.ts`), correr también `npm run seed` justo después — es lo que crea las filas de `permisos` para ese módulo (`PermisosService.sembrarCatalogo()`, único caller en `src/database/seed.ts`); sin eso el módulo nuevo responde 403 para todo el mundo aunque la tabla/columna ya exista. `npm run seed` es idempotente, seguro de re-correr en cualquier momento.

## Git

⚠️ **Punto crítico, no se puede vulnerar sin que el usuario lo pida explícitamente en el momento:** solo se commitea y pushea a la rama `develop`. `main` se mantiene vacía (solo el commit inicial) hasta que el usuario pida explícitamente el merge/release — nunca abrir, aceptar ni sugerir de iniciativa propia un PR `develop → main`, ni pushear directo a `main`. Convención de commits: `feat:`, `fix:`, `test:`, `chore:`, `docs:`, `refactor:`, `style:`. Detalle completo en [`../docs/ARQUITECTURA.md`](../docs/ARQUITECTURA.md) sección 17.

## Estado (Fases 1–4.5 del roadmap completas + extensiones)

Implementado: Auth (JWT, sin OTP), Negocios (creado por un rol de tier SISTEMA, crea el admin inicial del negocio), Sucursales, Usuarios, Categorías (2 niveles), Marcas/Líneas, **Proveedores** (`src/proveedores/` — datos + documentos RUT/cámara de comercio/certificación bancaria, y `ProductoProveedor` con costo por proveedor), Productos (multi-categoría, búsqueda por código de barras, proveedores vinculados), Bodegas + Inventario multi-bodega con kardex consultable (`GET /inventario/kardex`), **Lista de pedidos** (`src/lista-pedidos/` — flujo de compra PENDIENTE→PEDIDO→INGRESADO, ver abajo), Caja (turnos con arqueo), Ventas **CONTADO** y **CRÉDITO** (cuotas, mora automática) con pagos mixtos, **Métodos de pago** (`src/metodos-pago/` — catálogo editable por negocio, ver abajo), Clientes (cupo de crédito, + direcciones guardadas), **Domicilios** (`src/domicilios/` — ver abajo), Cobros, Alertas (+ push en vivo, ver abajo), Reportes (`ventas`, `márgenes`, `cierres-caja`), y **Roles granulares** (módulo `src/roles/` — ver abajo).

Pendiente (ver Roadmap en el doc de arquitectura): devoluciones/facturación electrónica/tienda online.

## Lista de pedidos — flujo de compra

`ItemPedido` (`src/lista-pedidos/`) tiene tres estados: **PENDIENTE** (se agregó desde una alerta de stock) → **PEDIDO** (`PATCH /lista-pedidos/:id/pedir` fija proveedor/costo/cantidad — hace upsert de `ProductoProveedor` con ese costo) → **INGRESADO** (`PATCH /lista-pedidos/:id/confirmar-ingreso` mueve stock vía `InventarioService.ajustarStock`, actualiza `Producto.costo` y, si el frontend ya resolvió que corresponde, `Producto.precioVenta` — la decisión de "¿subió/bajó el costo, actualizás el precio de venta?" se resuelve en el frontend *antes* de llamar a este endpoint, con una sola llamada). Un ítem `INGRESADO` es historial — no se puede borrar.

## Métodos de pago (`src/metodos-pago/`)

Reemplaza el viejo enum fijo `MetodoPago` (`common/enums/venta.enum.ts`) por un catálogo editable por negocio (CRUD tenant-scoped estándar, clon de `marcas/`). Los campos transaccionales que antes eran `type: 'enum'` (`venta_pagos.metodo_pago`, `movimientos_caja.metodo_pago`, `registros_pago_cuota.metodo_pago`) ahora son `varchar` **denormalizados** — guardan el `nombre` del método tal cual estaba en el catálogo al momento de la transacción (mismo patrón que `nombreProducto`/`nombreCliente`), no un FK — así el histórico no se rompe si el negocio renombra o desactiva un método más adelante, y `reportes.service.ts` sigue agrupando por string sin cambios. `MetodoPago.esEfectivo: boolean` es el único campo no-textual — el service se encarga de que solo uno esté marcado a la vez por negocio (desmarca los demás al guardar), y es lo que usa `CajaService.resumen()` para clasificar ventas en efectivo (conteo físico) vs. digitales (conciliadas automáticamente) en vez de comparar contra un valor de enum fijo. `VentasService` valida contra el catálogo activo del negocio en `crear()`/`abonarCuota()` (reemplaza la garantía que daba `@IsEnum(MetodoPago)`). Sembrado por defecto (`asegurarMetodosPorDefecto`, mismo patrón que `RolesService.asegurarRolesPorDefecto`) crea Efectivo/Tarjeta/Transferencia/Nequi/Daviplata/Otro en cada negocio nuevo.

## Domicilios (`src/domicilios/`)

Un `Domicilio` siempre nace de una venta — no hay endpoint para crearlo suelto. `CreateVentaDto.domicilio` (`{ direccionClienteId? | direccionNueva?, costoDomicilio? }`) viaja hasta `VentasService.crearVentaContado`/`crearVentaCredito`, que llama a `crearDomicilioSiAplica()` **dentro de la misma transacción** (`manager.getRepository(Domicilio)`/`manager.getRepository(DireccionCliente)`, mismo patrón que ya usa ese método para `MovimientoCaja`/`Cuota`) — si algo falla, no queda un domicilio huérfano. Exige `venta.clienteId` (las direcciones dependen de un cliente real). Si crea una dirección nueva, replica a mano la regla "primera dirección = predeterminada" de `ClientesService.agregarDireccion()` (no se puede reusar ese método porque tiene que correr en la misma transacción).

`DomiciliosService.marcarEnCamino`/`marcarEntregado`/`cancelar` validan el estado actual (NUEVO → EN_CAMINO → ENTREGADO, con CANCELADO alcanzable desde NUEVO o EN_CAMINO) y emiten `domicilios:cambio` por `RealtimeGateway` en cada transición — primer consumidor real del canal genérico (antes solo lo usaba Alertas).

## Tiempo real (`src/realtime/`)

`RealtimeGateway` (Socket.IO) es un canal push **genérico por negocio**, no acoplado a ningún dominio. Verifica el JWT a mano en `handleConnection` (los guards HTTP de Nest no aplican a WebSockets) y une el socket a la sala `negocio:{id}`. Expone un único método: `emitToNegocio(negocioId, evento, payload)`, usado hoy por `AlertasService` (`alertas:cambio`), `DomiciliosService`/`VentasService` (`domicilios:cambio`) y `FacturacionElectronicaService` (`documentos-electronicos:cambio`) — cualquier servicio de negocio nuevo que necesite avisar a las sesiones abiertas de un negocio lo reutiliza igual, sin tocar el gateway. Registra su propio `JwtModule` (no importa `AuthModule`) para no crear una dependencia circular.

## Facturas electrónicas (`src/facturacion-electronica/`)

La emisión DIAN va por Alegra (`AlegraClientService`), pero **Alegra/Alanube no genera PDF** — solo XML. La representación gráfica la arma `FacturaPdfService` (`pdfkit` + `qrcode`, sin repositorios: recibe un objeto plano ya resuelto); el logo sale de `LogoNegocioService` (cascada `Negocio.logoUrl` → plantilla FACTURA → tienda online → sin logo). Para que renovar la resolución no altere PDFs viejos, al emitir se congela un snapshot (emisor, resolución, número, QR) en columnas de `DocumentoElectronico`; los documentos anteriores a eso se completan solos la primera vez que se abren (`obtenerFactura`/`generarPdf`, consultan a Alegra una sola vez). Rutas por id en `/facturacion-electronica/facturas/...` (listado, detalle, `pdf`, `xml`, `reintentar`), todas filtradas por `negocioId` (404 para documentos ajenos). **Reintentar solo acepta RECHAZADO/ERROR/PENDIENTE sin `trackingReference`** — reintentar un ACEPTADO emitiría una segunda factura real.

**Contingencia (fase 6a).** `ContingenciaService` + entidad `PeriodoContingencia` (máximo uno abierto por negocio) + resolución de contingencia en columnas `contingencia_*` de la habilitación (tipo "Factura de talonario o de papel", prefijo distinto al de FE, sin clave técnica). Con un período abierto, `emitirDocumento` **no llama a Alegra**: asigna número de contingencia con lock, congela un snapshot con esa resolución (el emisor sigue siendo el negocio) y un QR provisional, y deja el documento `PENDIENTE` con `periodoContingenciaId`. Se transmite recién con el período cerrado (cron / `reintentar` rechazan antes) como `documentType "04"` (**en Alegra "03" es mandato**, no contingencia) + `additionalDocumentReference {number, issueDate}` del papel; la fecha del papel no se pisa. Entrada automática: 5 min seguidos de `AlegraNoDisponibleError` (red/timeout 20 s/HTTP ≥ 500/EPR5 — un rechazo no cuenta); salida automática solo para períodos `AUTOMATICA` cuando `GET /companies/{id}` vuelve a responder. Alerta `CONTINGENCIA_FACTURACION` a las 24 h de cerrado con facturas sin aceptar (plazo legal 48 h). La tirilla de contingencia imprime el fabricante del software desde `AURA_FABRICANTE_NOMBRE`/`AURA_FABRICANTE_NIT`. `POST /ventas/transcripcion-talonario` registra una factura de talonario escrita a mano (número y fecha del papel, dentro de un período). Norma y fuentes: `docs/specs/2026-09-29-fase6-contingencia-pendientes-investigacion.md`.

**Vender sin conexión (fase 6b).** La caja (pos-agent + navegador) vende sin backend y sincroniza después por `/ventas/sin-conexion/*` (permiso `VENTAS:CREAR`, porque lo usa el cajero): `GET datos` (emisor = el negocio, fabricante, resolución, ambiente), `POST reservas` (bloque de 50 números de contingencia por `terminalId`; avanza `contingencia_siguiente_numero` y queda en `reservas_contingencia`) y `POST sincronizar`. `VentasService.sincronizarSinConexion` es **idempotente por `idLocal`** (índice único parcial en `ventas`) y procesa cada venta por separado; respeta **precio e impuesto impresos** en la caja (sin promociones), **la hora real** (`created_at` = `creadaEn`) y **el turno** donde vendió (aunque ya esté cerrado, con alerta), permite **stock negativo** (crea la fila de inventario si no existe; la alerta sale sola con `verificarStockItem`) y no rechaza por cupo de crédito (alerta si la deuda lo supera). Con factura de papel, cada episodio sin conexión es un `PeriodoContingencia` de origen `SIN_CONEXION` (`episodio_id` único) y el documento se registra con la resolución del bloque (`transcrita = false`); en modo recibo se asigna el consecutivo real y el número impreso queda en `ventas.numero_sin_conexion`.

## Fechas y zona horaria

La base corre en UTC y `created_at`/`updated_at` son `timestamp` **sin** zona. `src/database/pg-utc.ts` (importado primero en `app.module.ts` y `data-source.ts`) hace que `pg` lea y escriba esas columnas como UTC sin depender de la zona del proceso — sin eso, en una máquina en America/Bogota cada fecha salía 5 h corrida y los filtros por rango quedaban desplazados. Todo "día"/"hoy" de negocio se calcula en hora de Colombia con `src/common/utils/fecha-colombia.ts` (`rangoDiasColombia`, `diaColombia`, `claveAgrupacionColombia`, etc.) — nunca `toISOString().slice(0, 10)` ni `setUTCHours`/`setHours` para cortar días. Ojo: `npx eslint --fix` sobre archivos existentes reformatea código ajeno (el repo no está al día con prettier) — correrlo solo sobre archivos nuevos.

## Roles y permisos (Fase 4)

Reemplaza el viejo enum fijo `RolUsuario` (SUPER_ADMIN/ADMIN_NEGOCIO/CAJERO). Ahora `Usuario.rolId` apunta a un `Rol` (`src/roles/entities/rol.entity.ts`) con un set editable de `Permiso` (módulo × acción Ver/Crear/Editar/Eliminar, catálogo fijo de 19 módulos en `common/enums/modulo-permiso.enum.ts`).

- **Dos tiers de rol**: `SISTEMA` (`negocioId: null`, gestiona el módulo `NEGOCIOS` — reemplaza a SUPER_ADMIN) y `NEGOCIO` (propio de un negocio, editable por su Administrador — reemplaza ADMIN_NEGOCIO/CAJERO). Cada negocio nuevo recibe automáticamente los roles por defecto "Administrador" (todos los permisos) y "Cajero" (subset operativo) — ver `RolesService.asegurarRolesPorDefecto`, también usado por `src/database/seed.ts`.
- **Guard**: `@RequierePermiso(ModuloPermiso, AccionPermiso)` + `PermissionsGuard` (reemplaza `@Roles()`/`RolesGuard`) — chequea `PermisosService.rolTienePermiso()` **contra la DB en cada request** (no confía en el JWT), así que editar los permisos de un rol tiene efecto inmediato para todos los que lo tienen, sin esperar a que vuelvan a loguearse.
- **Step-up por PIN**: `AuthService.autorizarConPin(negocioId, pin, modulo, accion)` generaliza el patrón "requiere el PIN de alguien con permiso X" — usado hoy por `VentasService.cancelar()` (antes hardcodeado a `rol === ADMIN_NEGOCIO`).
- `RolesModule` es `@Global()` porque `PermissionsGuard` (registrado como `APP_GUARD`) y cada controller necesitan inyectar `PermisosService` sin que cada módulo de feature tenga que importarlo.

## Multi-tenant

Todo dato de negocio lleva `negocioId`. Nunca uses el repositorio de TypeORM directamente en un servicio de negocio — extiende `TenantBaseService` (ver `src/common/services/tenant-base.service.ts`), que mezcla `negocioId` automáticamente desde el contexto CLS (poblado por `TenantGuard` a partir del JWT). Ver sección 6 del documento de arquitectura para el porqué. La única excepción documentada es `NegociosService` (y ahora `RolesService` para roles de tier SISTEMA) — operan por encima del nivel de tenant.

## Convenciones de Código

- **Soft deletes:** `activo: boolean`, nunca DELETE físico.
- **Denormalización:** guardar `nombreProducto`, `nombreCliente` junto al ID.
- **Archivos:** kebab-case (`create-producto.dto.ts`).
- **Entities:** PascalCase, sufijo `.entity.ts`.
- **DTOs Update:** `PartialType(CreateDto)`.

## Estructura de Módulos

```
src/{dominio}/
├── {dominio}.module.ts
├── {dominio}.controller.ts
├── {dominio}.service.ts
├── entities/{entidad}.entity.ts
└── dto/create-{entidad}.dto.ts
```
