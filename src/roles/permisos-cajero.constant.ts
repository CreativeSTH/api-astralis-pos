import { ModuloPermiso } from '../common/enums/modulo-permiso.enum';
import { AccionPermiso } from '../common/enums/accion-permiso.enum';

/**
 * Módulo → acciones que el Cajero por defecto recibe sembrado. Todo lo demás no listado aquí
 * queda sin marcar. Vive en su propio archivo (no en `roles.service.ts`) para que
 * `PermisosService.sembrarCatalogo()` pueda reusarlo sin crear un import circular entre los dos
 * servicios (`RolesService` ya inyecta `PermisosService`).
 */
export const PERMISOS_CAJERO: Partial<Record<ModuloPermiso, AccionPermiso[]>> =
  {
    [ModuloPermiso.SUCURSALES]: [AccionPermiso.VER],
    [ModuloPermiso.PRODUCTOS]: [AccionPermiso.VER],
    [ModuloPermiso.CATEGORIAS]: [AccionPermiso.VER],
    [ModuloPermiso.MARCAS]: [AccionPermiso.VER],
    [ModuloPermiso.LINEAS]: [AccionPermiso.VER],
    [ModuloPermiso.BODEGAS]: [AccionPermiso.VER],
    [ModuloPermiso.INVENTARIO]: [AccionPermiso.VER],
    [ModuloPermiso.PROVEEDORES]: [AccionPermiso.VER],
    [ModuloPermiso.VENTAS]: [
      AccionPermiso.VER,
      AccionPermiso.CREAR,
      AccionPermiso.EDITAR,
    ],
    [ModuloPermiso.CAJA]: [
      AccionPermiso.VER,
      AccionPermiso.CREAR,
      AccionPermiso.EDITAR,
    ],
    [ModuloPermiso.COBROS]: [AccionPermiso.VER],
    [ModuloPermiso.CLIENTES]: [AccionPermiso.VER, AccionPermiso.CREAR],
    [ModuloPermiso.DOMICILIOS]: [
      AccionPermiso.VER,
      AccionPermiso.CREAR,
      AccionPermiso.EDITAR,
    ],
    [ModuloPermiso.ALERTAS]: [AccionPermiso.VER],
    [ModuloPermiso.METODOS_PAGO]: [AccionPermiso.VER],
    [ModuloPermiso.PAGOS]: [AccionPermiso.VER],
  };
