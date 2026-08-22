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
```

API en `http://localhost:3000/api`, Swagger en `http://localhost:3000/docs`.

## Git

⚠️ **Punto crítico, no se puede vulnerar sin que el usuario lo pida explícitamente en el momento:** solo se commitea y pushea a la rama `develop`. `main` se mantiene vacía (solo el commit inicial) hasta que el usuario pida explícitamente el merge/release — nunca abrir, aceptar ni sugerir de iniciativa propia un PR `develop → main`, ni pushear directo a `main`. Convención de commits: `feat:`, `fix:`, `test:`, `chore:`, `docs:`, `refactor:`, `style:`. Detalle completo en [`../docs/ARQUITECTURA.md`](../docs/ARQUITECTURA.md) sección 17.

## Estado (Fases 1–4 del roadmap completas + extensiones)

Implementado: Auth (JWT, sin OTP), Negocios (creado por un rol de tier SISTEMA, crea el admin inicial del negocio), Sucursales, Usuarios, Categorías (2 niveles), Marcas/Líneas, **Proveedores** (`src/proveedores/` — datos + documentos RUT/cámara de comercio/certificación bancaria, y `ProductoProveedor` con costo por proveedor), Productos (multi-categoría, búsqueda por código de barras, proveedores vinculados), Bodegas + Inventario multi-bodega con kardex consultable (`GET /inventario/kardex`), **Lista de pedidos** (`src/lista-pedidos/` — flujo de compra PENDIENTE→PEDIDO→INGRESADO, ver abajo), Caja (turnos con arqueo), Ventas **CONTADO** y **CRÉDITO** (cuotas, mora automática) con pagos mixtos, Clientes (cupo de crédito, + direcciones guardadas), **Domicilios** (`src/domicilios/` — ver abajo), Cobros, Alertas (+ push en vivo, ver abajo), Reportes (`ventas`, `márgenes`, `cierres-caja`), y **Roles granulares** (módulo `src/roles/` — ver abajo).

Pendiente (ver Roadmap en el doc de arquitectura): devoluciones/facturación electrónica/tienda online.

## Lista de pedidos — flujo de compra

`ItemPedido` (`src/lista-pedidos/`) tiene tres estados: **PENDIENTE** (se agregó desde una alerta de stock) → **PEDIDO** (`PATCH /lista-pedidos/:id/pedir` fija proveedor/costo/cantidad — hace upsert de `ProductoProveedor` con ese costo) → **INGRESADO** (`PATCH /lista-pedidos/:id/confirmar-ingreso` mueve stock vía `InventarioService.ajustarStock`, actualiza `Producto.costo` y, si el frontend ya resolvió que corresponde, `Producto.precioVenta` — la decisión de "¿subió/bajó el costo, actualizás el precio de venta?" se resuelve en el frontend *antes* de llamar a este endpoint, con una sola llamada). Un ítem `INGRESADO` es historial — no se puede borrar.

## Domicilios (`src/domicilios/`)

Un `Domicilio` siempre nace de una venta — no hay endpoint para crearlo suelto. `CreateVentaDto.domicilio` (`{ direccionClienteId? | direccionNueva?, costoDomicilio? }`) viaja hasta `VentasService.crearVentaContado`/`crearVentaCredito`, que llama a `crearDomicilioSiAplica()` **dentro de la misma transacción** (`manager.getRepository(Domicilio)`/`manager.getRepository(DireccionCliente)`, mismo patrón que ya usa ese método para `MovimientoCaja`/`Cuota`) — si algo falla, no queda un domicilio huérfano. Exige `venta.clienteId` (las direcciones dependen de un cliente real). Si crea una dirección nueva, replica a mano la regla "primera dirección = predeterminada" de `ClientesService.agregarDireccion()` (no se puede reusar ese método porque tiene que correr en la misma transacción).

`DomiciliosService.marcarEnCamino`/`marcarEntregado`/`cancelar` validan el estado actual (NUEVO → EN_CAMINO → ENTREGADO, con CANCELADO alcanzable desde NUEVO o EN_CAMINO) y emiten `domicilios:cambio` por `RealtimeGateway` en cada transición — primer consumidor real del canal genérico (antes solo lo usaba Alertas).

## Tiempo real (`src/realtime/`)

`RealtimeGateway` (Socket.IO) es un canal push **genérico por negocio**, no acoplado a ningún dominio. Verifica el JWT a mano en `handleConnection` (los guards HTTP de Nest no aplican a WebSockets) y une el socket a la sala `negocio:{id}`. Expone un único método: `emitToNegocio(negocioId, evento, payload)`, usado hoy por `AlertasService` (`alertas:cambio`) y `DomiciliosService`/`VentasService` (`domicilios:cambio`) — cualquier servicio de negocio nuevo que necesite avisar a las sesiones abiertas de un negocio lo reutiliza igual, sin tocar el gateway. Registra su propio `JwtModule` (no importa `AuthModule`) para no crear una dependencia circular.

## Roles y permisos (Fase 4)

Reemplaza el viejo enum fijo `RolUsuario` (SUPER_ADMIN/ADMIN_NEGOCIO/CAJERO). Ahora `Usuario.rolId` apunta a un `Rol` (`src/roles/entities/rol.entity.ts`) con un set editable de `Permiso` (módulo × acción Ver/Crear/Editar/Eliminar, catálogo fijo de 16 módulos en `common/enums/modulo-permiso.enum.ts`).

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
