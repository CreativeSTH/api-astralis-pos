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

## Estado (Fases 1–3 del roadmap completas)

Implementado: Auth (JWT, sin OTP), Negocios (SUPER_ADMIN, crea el admin inicial del negocio), Sucursales, Usuarios, Categorías, Productos (con búsqueda por código de barras), Bodegas + Inventario multi-bodega con kardex consultable (`GET /inventario/kardex`), Caja (turnos con arqueo), Ventas **CONTADO** y **CRÉDITO** (cuotas, mora automática) con pagos mixtos, Clientes (cupo de crédito), Cobros, Alertas, y Reportes (`ventas`, `márgenes`, `cierres-caja`).

Pendiente (ver Roadmap en el doc de arquitectura): permisos granulares (Fase 4), devoluciones/facturación electrónica/tienda online (Fase 5).

## Multi-tenant

Todo dato de negocio lleva `negocioId`. Nunca uses el repositorio de TypeORM directamente en un servicio de negocio — extiende `TenantBaseService` (ver `src/common/services/tenant-base.service.ts`), que mezcla `negocioId` automáticamente desde el contexto CLS (poblado por `TenantGuard` a partir del JWT). Ver sección 6 del documento de arquitectura para el porqué.

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
