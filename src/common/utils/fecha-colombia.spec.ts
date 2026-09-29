import {
  claveAgrupacionColombia,
  diaColombia,
  diasDesdeFechaColombia,
  finDiaColombia,
  horaColombia,
  inicioDiaColombia,
  rangoDiasColombia,
  sumarDiasColombia,
} from './fecha-colombia';

/** 30/09 22:00 en Bogotá — de noche, cuando el día UTC ya cambió. */
const NOCHE_30_SEP = new Date('2026-10-01T03:00:00Z');

describe('fecha-colombia', () => {
  afterEach(() => jest.useRealTimers());

  it('inicioDiaColombia: 00:00 de Bogotá es 05:00 UTC del mismo día', () => {
    expect(inicioDiaColombia('2026-09-28').toISOString()).toBe(
      '2026-09-28T05:00:00.000Z',
    );
  });

  it('finDiaColombia: 23:59:59.999 de Bogotá es 04:59:59.999 UTC del día siguiente', () => {
    expect(finDiaColombia('2026-09-28').toISOString()).toBe(
      '2026-09-29T04:59:59.999Z',
    );
  });

  it('acepta un ISO con hora (solo usa la parte de la fecha) en vez de devolver Invalid Date', () => {
    expect(inicioDiaColombia('2026-09-28T00:00:00.000Z').toISOString()).toBe(
      '2026-09-28T05:00:00.000Z',
    );
  });

  it('una venta de las 8:29 p. m. del 28/09 en Colombia (01:29 UTC del 29) cae dentro del día 28', () => {
    const venta = new Date('2026-09-29T01:29:29Z');
    expect(
      venta >= inicioDiaColombia('2026-09-28') &&
        venta <= finDiaColombia('2026-09-28'),
    ).toBe(true);
    expect(venta >= inicioDiaColombia('2026-09-29')).toBe(false);
  });

  it('diaColombia agrupa por el día calendario de Colombia, no por el UTC', () => {
    expect(diaColombia(new Date('2026-09-29T01:29:29Z'))).toBe('2026-09-28');
    expect(diaColombia(new Date('2026-09-29T05:00:00Z'))).toBe('2026-09-29');
    expect(diaColombia(new Date('2026-09-29T04:59:59.999Z'))).toBe(
      '2026-09-28',
    );
  });

  it('sin fecha, diaColombia devuelve el día de hoy en Colombia', () => {
    jest.useFakeTimers().setSystemTime(NOCHE_30_SEP);
    expect(diaColombia()).toBe('2026-09-30');
  });

  it('sumarDiasColombia suma y resta días calendario cruzando meses', () => {
    expect(sumarDiasColombia('2026-10-01', -30)).toBe('2026-09-01');
    expect(sumarDiasColombia('2026-03-01', -1)).toBe('2026-02-28');
    expect(sumarDiasColombia('2026-09-30', 15)).toBe('2026-10-15');
  });

  describe('rangoDiasColombia', () => {
    it('con ambas fechas: desde 00:00 hasta 23:59:59.999 de Colombia', () => {
      const { desde, hasta } = rangoDiasColombia('2026-09-01', '2026-09-28');
      expect(desde.toISOString()).toBe('2026-09-01T05:00:00.000Z');
      expect(hasta.toISOString()).toBe('2026-09-29T04:59:59.999Z');
    });

    it('sin fechas: hasta = hoy en Colombia (aunque en UTC ya sea mañana) y desde = N días antes', () => {
      jest.useFakeTimers().setSystemTime(NOCHE_30_SEP);
      const { desde, hasta } = rangoDiasColombia(undefined, undefined, 30);
      expect(hasta.toISOString()).toBe('2026-10-01T04:59:59.999Z');
      expect(desde.toISOString()).toBe('2026-08-31T05:00:00.000Z');
    });

    it('solo hasta: desde = N días antes de ese hasta', () => {
      const { desde } = rangoDiasColombia(undefined, '2026-09-28', 7);
      expect(desde.toISOString()).toBe('2026-09-21T05:00:00.000Z');
    });
  });

  describe('claveAgrupacionColombia', () => {
    const NOCHE_DOMINGO = new Date('2026-09-28T02:00:00Z'); // domingo 27/09, 9 p. m. en Bogotá

    it('DIA: el día de Colombia', () => {
      expect(claveAgrupacionColombia(NOCHE_DOMINGO, 'DIA')).toBe('2026-09-27');
    });

    it('SEMANA: el lunes de la semana de Colombia (el domingo de noche NO salta a la semana siguiente)', () => {
      expect(claveAgrupacionColombia(NOCHE_DOMINGO, 'SEMANA')).toBe(
        '2026-09-21',
      );
    });

    it('MES: el mes de Colombia (la noche del 30/09 sigue siendo septiembre)', () => {
      expect(claveAgrupacionColombia(NOCHE_30_SEP, 'MES')).toBe('2026-09');
    });
  });

  describe('diasDesdeFechaColombia', () => {
    it('cuenta días calendario de Colombia: el mismo día del vencimiento es 0 aunque ya sea de noche', () => {
      jest.useFakeTimers().setSystemTime(NOCHE_30_SEP);
      expect(diasDesdeFechaColombia('2026-09-30')).toBe(0);
      expect(diasDesdeFechaColombia('2026-09-29')).toBe(1);
      expect(diasDesdeFechaColombia('2026-10-05')).toBe(-5);
    });
  });

  it('horaColombia: la hora del reloj en Colombia, sin depender de la zona del proceso', () => {
    expect(horaColombia(NOCHE_30_SEP)).toBe(22);
    expect(horaColombia(new Date('2026-09-29T04:59:00Z'))).toBe(23);
  });
});
