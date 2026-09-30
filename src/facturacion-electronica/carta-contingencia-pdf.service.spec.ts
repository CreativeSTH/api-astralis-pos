import { CartaContingenciaPdfService } from './carta-contingencia-pdf.service';

describe('CartaContingenciaPdfService', () => {
  it('genera un PDF para la carta de inicio y la de fin', async () => {
    const service = new CartaContingenciaPdfService();
    const base = {
      razonSocial: 'Tienda S.A.S.',
      nitConDv: '900123456-7',
      ciudad: 'Medellín',
      motivo: 'Sin internet',
      inicio: new Date('2026-09-29T14:00:00Z'),
      fin: new Date('2026-09-29T18:00:00Z'),
    };
    for (const tipo of ['INICIO', 'FIN'] as const) {
      const pdf = await service.generar({ ...base, tipo });
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    }
  });
});
