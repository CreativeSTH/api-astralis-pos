import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { NegociosService } from './negocios.service';
import { Negocio } from './entities/negocio.entity';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { RolesService } from '../roles/roles.service';
import { MetodosPagoService } from '../metodos-pago/metodos-pago.service';
import { PaquetesService } from '../paquetes/paquetes.service';
import { SuscripcionesService } from '../suscripciones/suscripciones.service';
import { EmailService } from '../email/email.service';

describe('NegociosService — registroPublico', () => {
  let service: NegociosService;
  let usuariosRepo: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let negociosRepo: { manager: { query: jest.Mock }; delete: jest.Mock };
  let paquetesService: { obtenerPaqueteTrialCompleto: jest.Mock };
  let suscripcionesService: { crearSuscripcionPrueba: jest.Mock };
  let dataSource: { transaction: jest.Mock };

  const negocioCreado = { id: 'neg-1', nombre: 'Negocio de prueba' } as Negocio;
  const paqueteTrial = { id: 'emp-1', nombre: 'POS Empresarial', esPaqueteTrialCompleto: true };

  beforeEach(async () => {
    usuariosRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => x),
    };
    negociosRepo = {
      manager: { query: jest.fn() },
      delete: jest.fn(),
    };
    paquetesService = { obtenerPaqueteTrialCompleto: jest.fn().mockResolvedValue(paqueteTrial) };
    suscripcionesService = { crearSuscripcionPrueba: jest.fn().mockResolvedValue(undefined) };
    dataSource = {
      transaction: jest.fn(async (cb) =>
        cb({ create: jest.fn((_, x) => x), save: jest.fn(async () => negocioCreado) }),
      ),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        NegociosService,
        { provide: getRepositoryToken(Negocio), useValue: negociosRepo },
        { provide: getRepositoryToken(Usuario), useValue: usuariosRepo },
        { provide: DataSource, useValue: dataSource },
        { provide: RolesService, useValue: { asegurarRolesPorDefecto: jest.fn().mockResolvedValue({ administrador: { id: 'rol-1' } }) } },
        { provide: MetodosPagoService, useValue: { asegurarMetodosPorDefecto: jest.fn().mockResolvedValue(undefined) } },
        { provide: PaquetesService, useValue: paquetesService },
        { provide: SuscripcionesService, useValue: suscripcionesService },
        { provide: EmailService, useValue: { enviar: jest.fn().mockResolvedValue(undefined) } },
      ],
    }).compile();

    service = moduleRef.get(NegociosService);
  });

  it('crea la suscripción de PRUEBA con el paquete marcado como trial completo, sin que el DTO traiga paqueteId', async () => {
    await service.registroPublico({
      nombreNegocio: 'Negocio de prueba',
      adminNombre: 'Admin',
      adminEmail: 'admin@test.local',
      adminPassword: 'pass123',
    });

    expect(paquetesService.obtenerPaqueteTrialCompleto).toHaveBeenCalled();
    expect(suscripcionesService.crearSuscripcionPrueba).toHaveBeenCalledWith('neg-1', 'emp-1');
  });
});
