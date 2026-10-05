import * as bcrypt from 'bcrypt';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { EmpleadosService } from './empleados.service';
import { CreateEmpleadoDto } from './dto/create-empleado.dto';
import { TipoDocumentoEmpleado } from './enums';

type Fila = Record<string, any>;

const base: Omit<CreateEmpleadoDto, 'pin'> = {
  nombre: 'Ana',
  tipoDocumento: TipoDocumentoEmpleado.CC,
  numeroDocumento: '123',
  salarioMensual: 2100000,
};

function entorno(o: { empleados?: Fila[]; usuarioExiste?: boolean; sucursalExiste?: boolean } = {}) {
  const empleados: Fila[] = (o.empleados ?? []).map((e) => ({ negocioId: 'neg-1', activo: true, ...e }));
  const repo = {
    find: jest.fn(async ({ where }) =>
      empleados.filter((e) => e.negocioId === where.negocioId && e.activo === where.activo).map((e) => ({ ...e })),
    ),
    findOne: jest.fn(async ({ where }) => {
      const e = empleados.find((x) => Object.entries(where).every(([k, v]) => x[k] === v));
      return e ? { ...e } : null;
    }),
    create: jest.fn((x) => ({ ...x })),
    save: jest.fn(async (x) => {
      const fila = { id: x.id ?? `emp-${empleados.length + 1}`, ...x };
      const i = empleados.findIndex((e) => e.id === fila.id);
      if (i >= 0) empleados[i] = { ...empleados[i], ...fila };
      else empleados.push(fila);
      return { ...fila };
    }),
  };
  const usuarioRepo = { exists: jest.fn(async () => o.usuarioExiste ?? true) };
  const sucursalRepo = { exists: jest.fn(async () => o.sucursalExiste ?? true) };
  const cls = { get: jest.fn(() => 'neg-1') };
  const service = new EmpleadosService(repo as any, usuarioRepo as any, sucursalRepo as any, cls as any);
  return { service, repo, empleados };
}

const hash1234 = bcrypt.hashSync('1234', 4);

describe('EmpleadosService', () => {
  it('rechaza crear un empleado con un PIN que ya usa otro empleado activo', async () => {
    const { service } = entorno({ empleados: [{ id: 'emp-a', nombre: 'Luis', numeroDocumento: '999', pinMarcacionHash: hash1234 }] });
    await expect(service.create({ ...base, pin: '1234' })).rejects.toThrow('Ese PIN ya lo usa otro empleado');
  });

  it('ignora el PIN de empleados inactivos', async () => {
    const { service } = entorno({
      empleados: [{ id: 'emp-a', nombre: 'Luis', numeroDocumento: '999', pinMarcacionHash: hash1234, activo: false }],
    });
    await expect(service.create({ ...base, pin: '1234' })).resolves.toBeDefined();
  });

  it('crea con el PIN hasheado y nunca lo devuelve', async () => {
    const { service, repo } = entorno();
    const e = await service.create({ ...base, pin: '9876' });
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ negocioId: 'neg-1', pinMarcacionHash: expect.stringMatching(/^\$2[aby]\$/) }),
    );
    expect(e).not.toHaveProperty('pinMarcacionHash');
    expect(e).not.toHaveProperty('pin');
  });

  it('rechaza un documento repetido en el negocio', async () => {
    const { service } = entorno({ empleados: [{ id: 'emp-a', nombre: 'Luis', numeroDocumento: '123', pinMarcacionHash: hash1234 }] });
    await expect(service.create({ ...base, pin: '5555' })).rejects.toThrow('Ya hay un empleado con ese documento');
  });

  it('permite actualizar conservando su propio documento', async () => {
    const { service } = entorno({ empleados: [{ id: 'emp-a', nombre: 'Luis', numeroDocumento: '123', pinMarcacionHash: hash1234 }] });
    const e = await service.update('emp-a', { numeroDocumento: '123', cargo: 'Cocinero' });
    expect(e.cargo).toBe('Cocinero');
    expect(e).not.toHaveProperty('pinMarcacionHash');
  });

  it('rechaza vincular un usuario de otro negocio', async () => {
    const { service } = entorno({ usuarioExiste: false });
    await expect(
      service.create({ ...base, pin: '5555', usuarioId: '7b3c9a3e-0000-4000-8000-000000000001' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rechaza una sucursal de otro negocio', async () => {
    const { service } = entorno({ sucursalExiste: false });
    await expect(
      service.create({ ...base, pin: '5555', sucursalId: '7b3c9a3e-0000-4000-8000-000000000002' }),
    ).rejects.toThrow('La sucursal no existe en este negocio');
  });

  it('traduce el índice único del usuario vinculado a un 409 legible', async () => {
    const { service, repo } = entorno();
    const err = new QueryFailedError('INSERT', [], new Error('dup'));
    Object.assign(err, { code: '23505', constraint: 'UQ_empleados_usuario' });
    repo.save.mockRejectedValueOnce(err);
    await expect(
      service.create({ ...base, pin: '5555', usuarioId: '7b3c9a3e-0000-4000-8000-000000000001' }),
    ).rejects.toThrow(new ConflictException('Ese usuario ya está vinculado a otro empleado'));
  });

  it('cambiarPin valida unicidad excluyendo al propio empleado', async () => {
    const { service, empleados } = entorno({
      empleados: [
        { id: 'emp-a', nombre: 'Luis', numeroDocumento: '1', pinMarcacionHash: hash1234 },
        { id: 'emp-b', nombre: 'Ana', numeroDocumento: '2', pinMarcacionHash: bcrypt.hashSync('2222', 4) },
      ],
    });
    await expect(service.cambiarPin('emp-a', '1234')).resolves.toBeUndefined();
    await expect(service.cambiarPin('emp-a', '2222')).rejects.toThrow('Ese PIN ya lo usa otro empleado');
    await service.cambiarPin('emp-a', '4321');
    expect(bcrypt.compareSync('4321', empleados.find((e) => e.id === 'emp-a')!.pinMarcacionHash)).toBe(true);
  });

  it('buscarPorPin devuelve el empleado activo dueño del PIN o null', async () => {
    const { service } = entorno({
      empleados: [
        { id: 'emp-a', nombre: 'Luis', numeroDocumento: '1', pinMarcacionHash: hash1234 },
        { id: 'emp-b', nombre: 'Ana', numeroDocumento: '2', pinMarcacionHash: bcrypt.hashSync('2222', 4), activo: false },
      ],
    });
    const e = await service.buscarPorPin('neg-1', '1234');
    expect(e).toMatchObject({ id: 'emp-a', nombre: 'Luis' });
    expect(e).not.toHaveProperty('pinMarcacionHash');
    expect(await service.buscarPorPin('neg-1', '2222')).toBeNull();
    expect(await service.buscarPorPin('neg-1', '0000')).toBeNull();
  });
});
