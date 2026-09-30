import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { PoliticaFacturacionService } from './politica-facturacion.service';
import { Negocio } from '../negocios/entities/negocio.entity';
import { HabilitacionFacturacionElectronica } from '../facturacion-electronica/entities/habilitacion-facturacion-electronica.entity';
import { OrigenObligacion, ResponsabilidadIva, TipoPersona } from '../negocios/entities/perfil-fiscal.enum';
import { EstadoHabilitacion } from '../facturacion-electronica/entities/estado-habilitacion.enum';
import { PeriodoContingencia } from '../facturacion-electronica/entities/periodo-contingencia.entity';
import { IsNull } from 'typeorm';

describe('PoliticaFacturacionService', () => {
  let service: PoliticaFacturacionService;
  let negocios: { findOne: jest.Mock; save: jest.Mock };
  let habilitaciones: { findOne: jest.Mock };
  let periodos: { count: jest.Mock };
  let negocio: Record<string, unknown>;

  beforeEach(async () => {
    negocio = { id: 'neg-1', tipoPersona: null, responsabilidadIva: null, perfilFiscalDeclaradoEn: null, obligadoDesde: null, origenObligacion: null };
    negocios = { findOne: jest.fn(async () => negocio), save: jest.fn(async (n) => n) };
    habilitaciones = { findOne: jest.fn().mockResolvedValue(null) };
    periodos = { count: jest.fn().mockResolvedValue(0) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        PoliticaFacturacionService,
        { provide: getRepositoryToken(Negocio), useValue: negocios },
        { provide: getRepositoryToken(HabilitacionFacturacionElectronica), useValue: habilitaciones },
        { provide: getRepositoryToken(PeriodoContingencia), useValue: periodos },
      ],
    }).compile();
    service = moduleRef.get(PoliticaFacturacionService);
  });

  it('estado lee negocio y habilitación del negocio y aplica calcularEstado', async () => {
    habilitaciones.findOne.mockResolvedValue({ estado: EstadoHabilitacion.HABILITADO, esHabilitacionDePrueba: false });
    expect((await service.estado('neg-1')).modo).toBe('ELECTRONICA');
    expect(negocios.findOne).toHaveBeenCalledWith({ where: { id: 'neg-1' } });
    expect(habilitaciones.findOne).toHaveBeenCalledWith({ where: { negocioId: 'neg-1' } });
  });

  it('estado informa si hay una contingencia abierta (fase 6a)', async () => {
    expect((await service.estado('neg-1')).contingenciaActiva).toBe(false);
    periodos.count.mockResolvedValue(1);
    expect((await service.estado('neg-1')).contingenciaActiva).toBe(true);
    expect(periodos.count).toHaveBeenCalledWith({ where: { negocioId: 'neg-1', fin: IsNull() } });
  });

  it('declararPerfil también devuelve contingenciaActiva', async () => {
    const estado = await service.declararPerfil('neg-1', 'usr-1', {
      tipoPersona: TipoPersona.NATURAL, responsabilidadIva: ResponsabilidadIva.NO_RESPONSABLE, aceptaDeclaracion: true,
    });
    expect(estado.contingenciaActiva).toBe(false);
  });

  it('estado de un negocio inexistente → 404', async () => {
    negocios.findOne.mockResolvedValue(null);
    await expect(service.estado('nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('declarar no obligado guarda perfil y quién/cuándo, sin obligación', async () => {
    const estado = await service.declararPerfil('neg-1', 'usr-1', {
      tipoPersona: TipoPersona.NATURAL, responsabilidadIva: ResponsabilidadIva.NO_RESPONSABLE, aceptaDeclaracion: true,
    });
    const guardado = negocios.save.mock.calls[0][0];
    expect(guardado).toMatchObject({ tipoPersona: 'NATURAL', responsabilidadIva: 'NO_RESPONSABLE', perfilFiscalDeclaradoPor: 'usr-1', obligadoDesde: null });
    expect(guardado.perfilFiscalDeclaradoEn).toBeInstanceOf(Date);
    expect(estado.modo).toBe('RECIBO');
  });

  it('declarar obligado sin fecha previa arranca la gracia hoy con origen DECLARADO', async () => {
    const estado = await service.declararPerfil('neg-1', 'usr-1', {
      tipoPersona: TipoPersona.JURIDICA, responsabilidadIva: ResponsabilidadIva.RESPONSABLE, aceptaDeclaracion: true,
    });
    const guardado = negocios.save.mock.calls[0][0];
    expect(guardado.origenObligacion).toBe(OrigenObligacion.DECLARADO);
    expect(guardado.obligadoDesde).toBeInstanceOf(Date);
    expect(estado).toMatchObject({ modo: 'GRACIA', diasGraciaRestantes: 40 });
  });

  it('re-declarar obligado NO reinicia la gracia (conserva obligadoDesde)', async () => {
    const antes = new Date('2026-09-01T15:00:00Z');
    Object.assign(negocio, { tipoPersona: 'JURIDICA', responsabilidadIva: 'RESPONSABLE', obligadoDesde: antes, origenObligacion: 'DECLARADO' });
    await service.declararPerfil('neg-1', 'usr-1', {
      tipoPersona: TipoPersona.NATURAL, responsabilidadIva: ResponsabilidadIva.RESPONSABLE, aceptaDeclaracion: true,
    });
    expect(negocios.save.mock.calls[0][0].obligadoDesde).toBe(antes);
  });

  it('pasar de obligado DECLARADO a no obligado limpia la obligación', async () => {
    Object.assign(negocio, { tipoPersona: 'NATURAL', responsabilidadIva: 'RESPONSABLE', obligadoDesde: new Date(), origenObligacion: 'DECLARADO' });
    await service.declararPerfil('neg-1', 'usr-1', {
      tipoPersona: TipoPersona.NATURAL, responsabilidadIva: ResponsabilidadIva.NO_RESPONSABLE, aceptaDeclaracion: true,
    });
    expect(negocios.save.mock.calls[0][0]).toMatchObject({ obligadoDesde: null, origenObligacion: null });
  });

  it('una obligación por TOPE_UVT no se borra al declarar no obligado', async () => {
    const tope = new Date('2026-09-10T15:00:00Z');
    Object.assign(negocio, { obligadoDesde: tope, origenObligacion: 'TOPE_UVT' });
    await service.declararPerfil('neg-1', 'usr-1', {
      tipoPersona: TipoPersona.NATURAL, responsabilidadIva: ResponsabilidadIva.NO_RESPONSABLE, aceptaDeclaracion: true,
    });
    expect(negocios.save.mock.calls[0][0]).toMatchObject({ obligadoDesde: tope, origenObligacion: 'TOPE_UVT' });
  });
});
