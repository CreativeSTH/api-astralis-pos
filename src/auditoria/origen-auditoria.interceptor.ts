import { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { ClsServiceManager } from 'nestjs-cls';
import { Observable } from 'rxjs';
import { CLS_ORIGEN_AUDITORIA } from './contexto-auditoria';
import { OrigenAuditoria } from './enums/origen-auditoria.enum';

/**
 * Marca de dónde viene una request sin usuario de AURA (webhooks, tienda online pública), para que
 * la auditoría no la registre como "Sistema". Uso: `@UseInterceptors(new OrigenAuditoriaInterceptor(...))`.
 */
export class OrigenAuditoriaInterceptor implements NestInterceptor {
  constructor(private readonly origen: OrigenAuditoria) {}

  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    const cls = ClsServiceManager.getClsService();
    if (cls.isActive()) cls.set(CLS_ORIGEN_AUDITORIA, this.origen);
    return next.handle();
  }
}
