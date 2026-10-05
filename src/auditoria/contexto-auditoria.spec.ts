import { ClsService } from 'nestjs-cls';
import {
  CLS_ORIGEN_AUDITORIA,
  leerContextoAuditoria,
} from './contexto-auditoria';
import { OrigenAuditoria } from './enums/origen-auditoria.enum';

const clsCon = (activo: boolean, valores: Record<string, unknown>) =>
  ({
    isActive: () => activo,
    get: (k: string) => valores[k],
  }) as unknown as ClsService;

describe('leerContextoAuditoria', () => {
  it('fuera de una request (cron) es SISTEMA sin usuario', () => {
    expect(leerContextoAuditoria(clsCon(false, {}))).toEqual({
      origen: OrigenAuditoria.SISTEMA,
      usuarioId: null,
      sucursalId: null,
      negocioId: null,
    });
  });
  it('con usuario logueado es USUARIO', () => {
    expect(
      leerContextoAuditoria(
        clsCon(true, { usuarioId: 'u1', sucursalId: 's1', negocioId: 'n1' }),
      ),
    ).toEqual({
      origen: OrigenAuditoria.USUARIO,
      usuarioId: 'u1',
      sucursalId: 's1',
      negocioId: 'n1',
    });
  });
  it('el origen marcado por el interceptor gana', () => {
    expect(
      leerContextoAuditoria(
        clsCon(true, { [CLS_ORIGEN_AUDITORIA]: OrigenAuditoria.WEBHOOK }),
      ).origen,
    ).toBe(OrigenAuditoria.WEBHOOK);
  });
  it('request sin usuario ni origen marcado es SISTEMA', () => {
    expect(leerContextoAuditoria(clsCon(true, {})).origen).toBe(
      OrigenAuditoria.SISTEMA,
    );
  });
});
