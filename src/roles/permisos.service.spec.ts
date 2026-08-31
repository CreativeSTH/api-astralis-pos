import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PermisosService } from './permisos.service';
import { Permiso } from './entities/permiso.entity';
import { Rol } from './entities/rol.entity';
import { RolTier } from '../common/enums/rol-tier.enum';
import { ModuloPermiso } from '../common/enums/modulo-permiso.enum';
import { AccionPermiso } from '../common/enums/accion-permiso.enum';

describe('PermisosService.sembrarCatalogo — reconciliación de Super Administrador', () => {
  it('agrega los permisos SISTEMA nuevos al rol "Super Administrador" ya existente', async () => {
    const superAdmin: Rol = {
      id: 'rol-sistema-1',
      nombre: 'Super Administrador',
      tier: RolTier.SISTEMA,
      negocioId: null,
      esDefault: true,
      permisos: [],
    } as unknown as Rol;

    const permisosRepo = {
      find: jest.fn().mockResolvedValue([]), // catálogo vacío antes de sembrar
      save: jest.fn(async (nuevos: Partial<Permiso>[]) =>
        nuevos.map((p, i) => ({ ...p, id: `permiso-${i}` }) as Permiso),
      ),
    };
    const rolesRepo = {
      find: jest.fn().mockResolvedValue([superAdmin]),
      save: jest.fn(async (roles: Rol[]) => roles),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PermisosService,
        { provide: getRepositoryToken(Permiso), useValue: permisosRepo },
        { provide: getRepositoryToken(Rol), useValue: rolesRepo },
      ],
    }).compile();

    const service = moduleRef.get(PermisosService);
    await service.sembrarCatalogo();

    const rolesGuardados = rolesRepo.save.mock.calls.flatMap((call: [Rol[]]) => call[0]);
    const superAdminGuardado = rolesGuardados.find((r: Rol) => r.nombre === 'Super Administrador');
    expect(superAdminGuardado).toBeDefined();
    expect(
      superAdminGuardado!.permisos.some((p) => p.modulo === ModuloPermiso.PAQUETES && p.accion === AccionPermiso.VER),
    ).toBe(true);
  });
});
