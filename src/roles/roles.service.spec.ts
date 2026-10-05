import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ClsService } from 'nestjs-cls';
import { RolesService } from './roles.service';
import { Rol } from './entities/rol.entity';
import { Permiso } from './entities/permiso.entity';
import { PermisosService } from './permisos.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { AccionAuditoria } from '../auditoria/enums/accion-auditoria.enum';
import { RolTier } from '../common/enums/rol-tier.enum';

describe('RolesService.actualizarPermisos — auditoría', () => {
  const crear = async (permisosNuevos: Partial<Permiso>[]) => {
    const rol = {
      id: 'r1',
      nombre: 'Cajero',
      tier: RolTier.NEGOCIO,
      negocioId: 'n1',
      permisos: [
        { id: 'p1', modulo: 'VENTAS', accion: 'VER', tier: RolTier.NEGOCIO },
      ],
    };
    const registrarAccion = jest.fn();
    const moduleRef = await Test.createTestingModule({
      providers: [
        RolesService,
        {
          provide: getRepositoryToken(Rol),
          useValue: {
            findOne: jest.fn().mockResolvedValue(rol),
            save: jest.fn((x: unknown) => x),
          },
        },
        { provide: getRepositoryToken(Permiso), useValue: {} },
        {
          provide: PermisosService,
          useValue: { findByIds: jest.fn().mockResolvedValue(permisosNuevos) },
        },
        {
          provide: ClsService,
          useValue: {
            get: (k: string) =>
              ({ rolTier: RolTier.NEGOCIO, negocioId: 'n1' })[k],
          },
        },
        { provide: AuditoriaService, useValue: { registrarAccion } },
      ],
    }).compile();
    return { servicio: moduleRef.get(RolesService), registrarAccion };
  };

  it('registra permisos agregados y quitados', async () => {
    const { servicio, registrarAccion } = await crear([
      {
        id: 'p2',
        modulo: 'CAJA' as Permiso['modulo'],
        accion: 'VER' as Permiso['accion'],
        tier: RolTier.NEGOCIO,
      },
    ]);
    await servicio.actualizarPermisos('r1', ['p2']);
    expect(registrarAccion).toHaveBeenCalledWith(
      expect.objectContaining({
        accion: AccionAuditoria.CAMBIAR_PERMISOS,
        entidad: 'Rol',
        entidadId: 'r1',
        negocioId: 'n1',
        cambios: [
          {
            campo: 'permisosAgregados',
            etiqueta: 'Permisos agregados',
            antes: null,
            despues: 'Caja: Ver',
          },
          {
            campo: 'permisosQuitados',
            etiqueta: 'Permisos quitados',
            antes: 'Ventas: Ver',
            despues: null,
          },
        ],
      }),
    );
  });

  it('no registra nada si los permisos no cambian', async () => {
    const { servicio, registrarAccion } = await crear([
      {
        id: 'p1',
        modulo: 'VENTAS' as Permiso['modulo'],
        accion: 'VER' as Permiso['accion'],
        tier: RolTier.NEGOCIO,
      },
    ]);
    await servicio.actualizarPermisos('r1', ['p1']);
    expect(registrarAccion).not.toHaveBeenCalled();
  });
});
