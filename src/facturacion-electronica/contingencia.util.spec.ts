import { contenidoQrContingencia, fabricanteSoftware, resolucionContingenciaDesdeDocumento } from './contingencia.util';
import { DocumentoElectronico } from './entities/documento-electronico.entity';

describe('contingencia.util', () => {
  it('arma la resolución de Alegra desde el snapshot del documento, con technicalKey vacío', () => {
    const doc = {
      prefijo: 'CONT', resolucionNumero: '18764000009999', resolucionFechaInicio: '2026-01-01',
      resolucionFechaFin: '2028-01-01', resolucionRangoDesde: 1, resolucionRangoHasta: 5000,
    } as DocumentoElectronico;
    expect(resolucionContingenciaDesdeDocumento(doc)).toEqual({
      prefix: 'CONT', resolutionNumber: '18764000009999', startDate: '2026-01-01', endDate: '2028-01-01',
      minNumber: 1, maxNumber: 5000, technicalKey: '',
    });
  });

  it('el QR provisional lleva número, fecha y hora de Colombia, NIT, adquirente y valores con 2 decimales', () => {
    const texto = contenidoQrContingencia({
      numeroCompleto: 'CONT501', fecha: new Date('2026-09-29T19:03:00Z'), nitEmisor: '900123456',
      documentoAdquirente: '222222222222', subtotal: 10000, iva: 1900, total: 11900,
    });
    expect(texto.split('\n')).toEqual([
      'NumFac: CONT501',
      'FecFac: 2026-09-29',
      'HorFac: 14:03:00-05:00',
      'NitFac: 900123456',
      'DocAdq: 222222222222',
      'ValFac: 10000.00',
      'ValIva: 1900.00',
      'ValTolFac: 11900.00',
    ]);
  });

  it('la fecha del QR es la de Colombia aunque en UTC ya sea el día siguiente', () => {
    const texto = contenidoQrContingencia({
      numeroCompleto: 'CONT1', fecha: new Date('2026-09-30T02:30:00Z'), nitEmisor: '1',
      documentoAdquirente: '2', subtotal: 1, iva: 0, total: 1,
    });
    expect(texto).toContain('FecFac: 2026-09-29');
    expect(texto).toContain('HorFac: 21:30:00-05:00');
  });

  describe('fabricanteSoftware', () => {
    const original = { ...process.env };
    afterEach(() => {
      process.env = { ...original };
    });

    it('con las variables de entorno, nombre y NIT', () => {
      process.env.AURA_FABRICANTE_NOMBRE = 'Sebastian Torres';
      process.env.AURA_FABRICANTE_NIT = '1047444002-2';
      expect(fabricanteSoftware()).toBe('Software: AURA — fabricante Sebastian Torres (NIT 1047444002-2)');
    });

    it('sin variables, solo el nombre del software', () => {
      delete process.env.AURA_FABRICANTE_NOMBRE;
      delete process.env.AURA_FABRICANTE_NIT;
      expect(fabricanteSoftware()).toBe('Software: AURA');
    });
  });
});
