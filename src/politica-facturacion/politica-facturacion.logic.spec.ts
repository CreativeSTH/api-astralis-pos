import { ForbiddenException } from '@nestjs/common';
import {
  CODIGO_BLOQUEO,
  calcularEstado,
  esObligado,
  NegocioFiscal,
  tipoComprobanteParaModo,
} from './politica-facturacion.logic';
import { OrigenObligacion, ResponsabilidadIva, TipoPersona } from '../negocios/entities/perfil-fiscal.enum';
import { EstadoHabilitacion } from '../facturacion-electronica/entities/estado-habilitacion.enum';
import { TipoComprobanteVenta } from '../common/enums/tipo-comprobante.enum';

const SIN_DECLARAR: NegocioFiscal = {
  tipoPersona: null, responsabilidadIva: null, perfilFiscalDeclaradoEn: null, obligadoDesde: null, origenObligacion: null,
};
const NATURAL_NO_RESP: NegocioFiscal = {
  ...SIN_DECLARAR, tipoPersona: TipoPersona.NATURAL, responsabilidadIva: ResponsabilidadIva.NO_RESPONSABLE,
  perfilFiscalDeclaradoEn: new Date('2026-09-01T15:00:00Z'),
};
/** Obligado desde el 28/09 a las 8 p. m. en Colombia (01:00 UTC del 29). */
const obligado = (extra: Partial<NegocioFiscal> = {}): NegocioFiscal => ({
  ...NATURAL_NO_RESP, responsabilidadIva: ResponsabilidadIva.RESPONSABLE,
  obligadoDesde: new Date('2026-09-29T01:00:00Z'), origenObligacion: OrigenObligacion.DECLARADO, ...extra,
});
const HAB_REAL = { estado: EstadoHabilitacion.HABILITADO, esHabilitacionDePrueba: false };
const HAB_PRUEBA = { estado: EstadoHabilitacion.HABILITADO, esHabilitacionDePrueba: true };
/** Mediodía en Colombia del día dado (17:00 UTC). */
const alMediodia = (dia: string) => jest.useFakeTimers().setSystemTime(new Date(`${dia}T17:00:00Z`));

describe('politica-facturacion.logic', () => {
  afterEach(() => jest.useRealTimers());

  describe('esObligado', () => {
    it('null si el perfil no está declarado', () => expect(esObligado(SIN_DECLARAR)).toBeNull());
    it('persona natural no responsable de IVA → no obligada', () => expect(esObligado(NATURAL_NO_RESP)).toBe(false));
    it('persona jurídica → obligada aunque diga no responsable', () =>
      expect(esObligado({ ...NATURAL_NO_RESP, tipoPersona: TipoPersona.JURIDICA })).toBe(true));
    it('responsable de IVA → obligada', () =>
      expect(esObligado({ ...NATURAL_NO_RESP, responsabilidadIva: ResponsabilidadIva.RESPONSABLE })).toBe(true));
    it('Régimen Simple → obligada', () =>
      expect(esObligado({ ...NATURAL_NO_RESP, responsabilidadIva: ResponsabilidadIva.REGIMEN_SIMPLE })).toBe(true));
    it('tope UVT superado → obligada aunque no haya declarado', () =>
      expect(esObligado({ ...SIN_DECLARAR, origenObligacion: OrigenObligacion.TOPE_UVT })).toBe(true));
  });

  describe('calcularEstado', () => {
    it('habilitación real → ELECTRONICA aunque sea obligado y haya pasado la gracia', () => {
      alMediodia('2026-12-31');
      expect(calcularEstado(obligado(), HAB_REAL).modo).toBe('ELECTRONICA');
    });

    it('habilitación de prueba y no obligado (o sin declarar) → ELECTRONICA', () => {
      expect(calcularEstado(NATURAL_NO_RESP, HAB_PRUEBA).modo).toBe('ELECTRONICA');
      expect(calcularEstado(SIN_DECLARAR, HAB_PRUEBA).modo).toBe('ELECTRONICA');
    });

    it('habilitación de prueba y obligado → cuenta como no habilitado (GRACIA)', () => {
      alMediodia('2026-09-29');
      expect(calcularEstado(obligado(), HAB_PRUEBA).modo).toBe('GRACIA');
    });

    it('sin declarar y sin habilitación → SIN_DECLARAR', () => {
      const estado = calcularEstado(SIN_DECLARAR, null);
      expect(estado).toEqual({ modo: 'SIN_DECLARAR', obligado: null, diasGraciaRestantes: null, fechaLimiteGracia: null, perfil: null });
    });

    it('no obligado → RECIBO, con el perfil declarado', () => {
      const estado = calcularEstado(NATURAL_NO_RESP, null);
      expect(estado.modo).toBe('RECIBO');
      expect(estado.obligado).toBe(false);
      expect(estado.perfil).toEqual({
        tipoPersona: TipoPersona.NATURAL, responsabilidadIva: ResponsabilidadIva.NO_RESPONSABLE,
        declaradoEn: NATURAL_NO_RESP.perfilFiscalDeclaradoEn,
      });
    });

    it('obligado el mismo día (de noche en Colombia) → día 1 de gracia, 40 restantes, último día 06/11', () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-09-29T02:00:00Z')); // 28/09 9 p. m. en Colombia
      const estado = calcularEstado(obligado(), null);
      expect(estado).toMatchObject({ modo: 'GRACIA', obligado: true, diasGraciaRestantes: 40, fechaLimiteGracia: '2026-11-06' });
    });

    it('día 40 (06/11) → todavía GRACIA con 1 día restante', () => {
      alMediodia('2026-11-06');
      expect(calcularEstado(obligado(), null)).toMatchObject({ modo: 'GRACIA', diasGraciaRestantes: 1 });
    });

    it('día 41 (07/11) → BLOQUEADO', () => {
      alMediodia('2026-11-07');
      expect(calcularEstado(obligado(), null)).toMatchObject({ modo: 'BLOQUEADO', diasGraciaRestantes: 0, fechaLimiteGracia: '2026-11-06' });
    });

    it('habilitación que no está HABILITADO no cuenta', () => {
      alMediodia('2026-11-07');
      expect(calcularEstado(obligado(), { estado: EstadoHabilitacion.TESTSET_EN_CURSO, esHabilitacionDePrueba: false }).modo).toBe('BLOQUEADO');
    });
  });

  describe('tipoComprobanteParaModo', () => {
    it('ELECTRONICA → FACTURA_ELECTRONICA; RECIBO, GRACIA y SIN_DECLARAR → RECIBO', () => {
      expect(tipoComprobanteParaModo('ELECTRONICA')).toBe(TipoComprobanteVenta.FACTURA_ELECTRONICA);
      for (const modo of ['RECIBO', 'GRACIA', 'SIN_DECLARAR'] as const) {
        expect(tipoComprobanteParaModo(modo)).toBe(TipoComprobanteVenta.RECIBO);
      }
    });

    it('BLOQUEADO → 403 con code FACTURACION_ELECTRONICA_OBLIGATORIA', () => {
      let error: unknown;
      try {
        tipoComprobanteParaModo('BLOQUEADO');
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getResponse()).toMatchObject({ code: CODIGO_BLOQUEO });
    });
  });
});
