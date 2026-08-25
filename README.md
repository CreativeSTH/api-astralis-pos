# pos-backend

API REST del sistema POS multi-negocio — **NestJS + TypeORM + PostgreSQL**. Cubre punto de venta (contado y crédito), inventario multi-bodega, caja por turnos, clientes, proveedores, cupones/promociones, facturación con plantillas configurables, roles y permisos granulares, y notificaciones en tiempo real por WebSocket.

Documento completo de arquitectura y modelo de datos: [`../docs/ARQUITECTURA.md`](../docs/ARQUITECTURA.md).

## Stack

- **NestJS** (Node.js) + **TypeORM** + **PostgreSQL 16**
- Autenticación JWT (`passport-jwt`) + bcrypt
- Roles y permisos granulares por módulo × acción, chequeados en vivo contra la base
- Tiempo real vía **Socket.IO** (`@nestjs/websockets`)
- Documentación interactiva con **Swagger** (`/docs`, deshabilitado en producción)
- `docker-compose` para PostgreSQL (y `pgAdmin` opcional en modo dev)

## Requisitos

- Node.js 20+
- Docker (para PostgreSQL) o una instancia propia de Postgres 16

## Puesta en marcha

```bash
# 1. Variables de entorno
cp .env.example .env   # completar DB_PASSWORD, JWT_SECRET, credenciales del seed

# 2. Base de datos
docker compose up -d postgres

# 3. Dependencias
npm install

# 4. Primer usuario (SUPER_ADMIN de plataforma)
npm run seed

# 5. Arrancar en modo desarrollo (hot-reload)
npm run start:dev
```

La API queda en `http://localhost:3000/api`, con Swagger en `http://localhost:3000/docs`.

En desarrollo el esquema se sincroniza solo (`synchronize` activo). **Antes del primer arranque contra una base de producción nueva** hay que correr las migraciones una vez:

```bash
npm run migration:run
```

## Otros comandos

```bash
npm run build              # compilar para producción
npm test                   # tests unitarios
npm run lint                # ESLint con auto-fix
npm run migration:generate -- src/database/migrations/NombreMigracion
npm run migration:run
```

## Estructura

```
src/
├── common/        # TenantBaseService, guards, filtros, enums compartidos
├── auth/          # Login, JWT, PIN de cajero, step-up por PIN
├── roles/         # Roles y permisos granulares (PermissionsGuard global)
├── negocios/      # Alta y gestión de negocios (tier SISTEMA)
├── productos/, categorias/, marcas/, proveedores/, bodegas/, inventario/
├── ventas/        # Contado y crédito, cupones/promociones, comprobantes
├── caja/          # Turnos y movimientos de caja
├── cobros/        # Cuotas y mora de ventas a crédito
├── clientes/      # Cupo de crédito, direcciones, notas
├── domicilios/    # Nace de una venta — flujo NUEVO → EN_CAMINO → ENTREGADO
├── alertas/       # Stock bajo, cuotas vencidas, reglas personalizadas
├── graficos/       # Gráficos configurables del dashboard/reportes
├── reportes/       # Ventas, márgenes, cierres de caja
├── realtime/       # Gateway de Socket.IO genérico por negocio
└── database/       # DataSource del CLI + migraciones versionadas
```

## Multi-tenant

Todo dato de negocio lleva `negocioId`, resuelto del JWT vía `nestjs-cls` — nunca se recibe en el body de un endpoint normal. Los servicios de negocio extienden `TenantBaseService` en vez de usar el repositorio de TypeORM directo (ver sección 6 de `ARQUITECTURA.md`).

## Repos relacionados

| Repo | Rol |
|---|---|
| [`pos-frontend`](https://github.com/CreativeSTH/Frontend-Pos) | Angular — POS (cajero) + back-office (admin) |
| [`pos-agent`](https://github.com/CreativeSTH/Pos-Agent) | Puente local a impresora térmica/cajón, corre en la PC de caja |

## Git

Se commitea y pushea solo a `develop`. `main` recibe merges únicamente cuando se pide explícitamente un release — ver sección 17 de `ARQUITECTURA.md`.
