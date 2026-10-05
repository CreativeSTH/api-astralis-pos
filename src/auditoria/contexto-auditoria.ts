import { ClsService } from 'nestjs-cls';
import { OrigenAuditoria } from './enums/origen-auditoria.enum';

/** Clave CLS que setea `OrigenAuditoriaInterceptor` en webhooks y en la tienda online pública. */
export const CLS_ORIGEN_AUDITORIA = 'auditoriaOrigen';
/** Cache por request del nombre del usuario (una sola consulta aunque haya varios registros). */
export const CLS_NOMBRE_USUARIO_AUDITORIA = 'auditoriaUsuarioNombre';

export interface ContextoAuditoria {
  origen: OrigenAuditoria;
  usuarioId: string | null;
  sucursalId: string | null;
  negocioId: string | null;
}

export function leerContextoAuditoria(cls: ClsService): ContextoAuditoria {
  if (!cls.isActive()) {
    return {
      origen: OrigenAuditoria.SISTEMA,
      usuarioId: null,
      sucursalId: null,
      negocioId: null,
    };
  }
  const usuarioId = cls.get<string | undefined>('usuarioId') ?? null;
  const marcado = cls.get<OrigenAuditoria | undefined>(CLS_ORIGEN_AUDITORIA);
  return {
    origen:
      marcado ??
      (usuarioId ? OrigenAuditoria.USUARIO : OrigenAuditoria.SISTEMA),
    usuarioId,
    sucursalId: cls.get<string | undefined>('sucursalId') ?? null,
    negocioId: cls.get<string | undefined>('negocioId') ?? null,
  };
}
