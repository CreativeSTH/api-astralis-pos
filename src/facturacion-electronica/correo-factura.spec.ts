import { unzipSync, strFromU8 } from 'fflate';
import { armarZipFactura, asuntoCorreoFactura, codigoTipoDocumento, PESO_MAXIMO_ZIP_BYTES } from './correo-factura';

describe('correo-factura', () => {
  it('asunto con el formato del anexo técnico 9.1 (NIT sin DV, separador ;)', () => {
    expect(
      asuntoCorreoFactura({
        nitEmisor: '900.123.456-7',
        razonSocial: 'Ferretería El Clavo SAS',
        numero: 'FE120',
        tipoDocumento: '01',
        nombreComercial: 'El Clavo',
      }),
    ).toBe('900123456;Ferretería El Clavo SAS;FE120;01;El Clavo');
  });

  it('un ; dentro de un nombre no rompe los campos del asunto', () => {
    expect(
      asuntoCorreoFactura({ nitEmisor: '900123456', razonSocial: 'A;B', numero: 'X1', tipoDocumento: '01', nombreComercial: 'C;D' }),
    ).toBe('900123456;A,B;X1;01;C,D');
  });

  it('lee el InvoiceTypeCode de la factura embebida (CDATA o escapada); 01 si no aparece', () => {
    expect(codigoTipoDocumento('<![CDATA[<cbc:InvoiceTypeCode>03</cbc:InvoiceTypeCode>]]>')).toBe('03');
    expect(codigoTipoDocumento('&lt;cbc:InvoiceTypeCode listID="x"&gt;01&lt;/cbc:InvoiceTypeCode&gt;')).toBe('01');
    expect(codigoTipoDocumento('<AttachedDocument/>')).toBe('01');
  });

  it('el ZIP trae el PDF y el AttachedDocument con el número como nombre', () => {
    const zip = armarZipFactura({
      nombreBase: 'FE120',
      pdf: Buffer.from('%PDF-1.3'),
      attachedDocument: Buffer.from('<AttachedDocument/>'),
    });
    const archivos = unzipSync(new Uint8Array(zip));
    expect(Object.keys(archivos).sort()).toEqual(['FE120.pdf', 'FE120.xml']);
    expect(strFromU8(archivos['FE120.xml'])).toBe('<AttachedDocument/>');
  });

  it('límite DIAN de 2 MB por envío', () => {
    expect(PESO_MAXIMO_ZIP_BYTES).toBe(2 * 1024 * 1024);
  });
});
