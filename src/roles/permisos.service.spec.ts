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
      find: jest
        .fn()
        .mockResolvedValueOnce([]) // primera llamada: administradores (tier: NEGOCIO) — vacío
        .mockResolvedValueOnce([superAdmin]) // segunda llamada: superAdmins (tier: SISTEMA) — el Super Admin
        .mockResolvedValueOnce([]), // tercera llamada: cajeros (tier: NEGOCIO) — vacío
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

    // Verificar que se hizo save con el Super Admin que contiene PAQUETES
    const rolesGuardados = rolesRepo.save.mock.calls.flatMap((call: [Rol[]]) => call[0]);
    const superAdminGuardado = rolesGuardados.find((r: Rol) => r.nombre === 'Super Administrador');
    expect(superAdminGuardado).toBeDefined();
    expect(
      superAdminGuardado!.permisos.some((p) => p.modulo === ModuloPermiso.PAQUETES && p.accion === AccionPermiso.VER),
    ).toBe(true);

    // Verificar que el segundo find() (para Super Administrador) fue llamado con la query correcta
    // Si la query fuera incorrecta (tier equivocado, esDefault faltante, nombre mal escrito),
    // este assertion fallaría, lo que no ocurriría con un mock que devuelve siempre lo mismo
    expect(rolesRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tier: RolTier.SISTEMA, esDefault: true, nombre: 'Super Administrador' },
        relations: { permisos: true },
      }),
    );
  });
});
