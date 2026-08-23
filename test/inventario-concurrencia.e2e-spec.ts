import { Test, TestingModule } from '@nestjs/testing';
import { ClsService } from 'nestjs-cls';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { InventarioService } from '../src/inventario/inventario.service';
import { Negocio } from '../src/negocios/entities/negocio.entity';
import { Sucursal } from '../src/sucursales/entities/sucursal.entity';
import { Bodega } from '../src/bodegas/entities/bodega.entity';
import { Producto } from '../src/productos/entities/producto.entity';
import { Inventario } from '../src/inventario/entities/inventario.entity';
import { TipoMovimientoInventario } from '../src/common/enums/tipo-movimiento-inventario.enum';

/**
 * Prueba de humo contra la base real (no mocks). Un solo intento de dos ventas "simultáneas" con
 * `Promise.allSettled` no es confiable para probar una condición de carrera: el timing real del
 * event loop/red a veces serializa las dos llamadas igual, con o sin el lock (falso positivo o
 * falso negativo de pura suerte — confirmado a mano durante el desarrollo de este test: sin el
 * lock, 29 de 30 rondas mostraban sobreventa, pero una sola ronda suelta podía salir bien por
 * casualidad). Por eso se repite muchas veces: con el lock puesto, ninguna ronda debería mostrar
 * sobreventa nunca — no es un tema de probabilidad, el lock elimina la carrera por completo.
 */
describe('InventarioService — concurrencia de stock (e2e)', () => {
  let moduleRef: TestingModule;
  let inventarioService: InventarioService;
  let cls: ClsService;
  let dataSource: DataSource;
  let negocioId: string;
  let productoId: string;
  let bodegaId: string;

  const conNegocio = <T>(fn: () => Promise<T>): Promise<T> =>
    cls.run(() => {
      cls.set('negocioId', negocioId);
      return fn();
    });

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    inventarioService = moduleRef.get(InventarioService);
    cls = moduleRef.get(ClsService);
    dataSource = moduleRef.get(DataSource);

    const negocio = await dataSource
      .getRepository(Negocio)
      .save({ nombre: 'Test Concurrencia Stock' });
    negocioId = negocio.id;

    const sucursal = await dataSource
      .getRepository(Sucursal)
      .save({ negocioId, nombre: 'Sede test' });

    const bodega = await dataSource
      .getRepository(Bodega)
      .save({ negocioId, sucursalId: sucursal.id, nombre: 'Bodega test' });
    bodegaId = bodega.id;

    const producto = await dataSource
      .getRepository(Producto)
      .save({ negocioId, nombre: 'Producto test', precioVenta: 1000 });
    productoId = producto.id;

    await dataSource
      .getRepository(Inventario)
      .save({ negocioId, productoId, bodegaId, cantidad: 1, stockMinimo: 0 });
  });

  afterAll(async () => {
    await dataSource.getRepository(Negocio).delete({ id: negocioId });
    await moduleRef.close();
  });

  it('con stock=1, 20 rondas de dos ventas simultáneas nunca ganan las dos', async () => {
    const inventarioRepo = dataSource.getRepository(Inventario);
    const vender = () =>
      conNegocio(() =>
        inventarioService.ajustarStock({
          productoId,
          bodegaId,
          tipo: TipoMovimientoInventario.VENTA,
          cantidad: 1,
        }),
      );

    for (let ronda = 0; ronda < 20; ronda++) {
      await inventarioRepo.update(
        { negocioId, productoId, bodegaId },
        { cantidad: 1 },
      );

      const resultados = await Promise.allSettled([vender(), vender()]);
      const exitosas = resultados.filter(
        (r) => r.status === 'fulfilled',
      ).length;

      expect(exitosas).toBe(1);
    }

    const inventarioFinal = await inventarioRepo.findOne({
      where: { negocioId, productoId, bodegaId },
    });
    expect(Number(inventarioFinal!.cantidad)).toBe(0);
  });

  it('ajustarStock rechaza vender más de lo que hay', async () => {
    await expect(
      conNegocio(() =>
        inventarioService.ajustarStock({
          productoId,
          bodegaId,
          tipo: TipoMovimientoInventario.VENTA,
          cantidad: 999,
        }),
      ),
    ).rejects.toThrow('Stock insuficiente');
  });
});
