import {
  camposCambiados,
  camposIniciales,
  clasificarAccion,
  construirCambios,
  descripcionAutomatica,
  formatearMoneda,
  formatearValor,
  idsDe,
  valorComparable,
} from './auditoria-diff';
import { AccionAuditoria } from './enums/accion-auditoria.enum';
import { OpcionesAuditable } from './auditoria.types';
import { ModuloPermiso } from '../common/enums/modulo-permiso.enum';

class Categoria {}

const opciones: OpcionesAuditable = {
  modulo: ModuloPermiso.PRODUCTOS,
  nombre: 'el producto',
  etiqueta: (p: { nombre: string }) => p.nombre,
  campos: {
    nombre: { label: 'Nombre' },
    precioVenta: { label: 'Precio de venta', formato: 'moneda' },
    porcentajeImpuesto: { label: 'IVA', formato: 'porcentaje' },
    marcaId: { label: 'Marca', formato: 'relacion', entidad: () => Categoria },
    categorias: {
      label: 'Categorías',
      formato: 'relacionMultiple',
      entidad: () => Categoria,
    },
    activo: { label: 'Activo', formato: 'booleano' },
    unidadMedida: {
      label: 'Unidad',
      formato: 'enum',
      opciones: { UNIDAD: 'Unidad', KG: 'Kilogramo' },
    },
  },
  secretos: { passwordHash: 'Contraseña' },
};

describe('valorComparable', () => {
  it('normaliza numéricos que llegan como string desde Postgres', () => {
    expect(valorComparable('10000.00', 'moneda')).toBe(
      valorComparable(10000, 'moneda'),
    );
  });
  it('trata null, undefined y "" como sin valor', () => {
    expect(valorComparable(null)).toBeNull();
    expect(valorComparable(undefined)).toBeNull();
    expect(valorComparable('')).toBeNull();
  });
  it('compara relaciones múltiples por ids ordenados, vengan como ids u objetos', () => {
    expect(valorComparable(['b', 'a'], 'relacionMultiple')).toBe(
      valorComparable([{ id: 'a' }, { id: 'b' }], 'relacionMultiple'),
    );
  });
  it('compara fechas por instante', () => {
    expect(valorComparable(new Date('2026-10-02T10:00:00Z'), 'fecha')).toBe(
      valorComparable('2026-10-02T10:00:00.000Z', 'fecha'),
    );
  });
});

describe('idsDe', () => {
  it('acepta strings y objetos con id, ignora vacíos', () => {
    expect(idsDe(['x', { id: 'y' }, null])).toEqual(['x', 'y']);
    expect(idsDe(undefined)).toEqual([]);
  });
});

describe('formatearValor', () => {
  it('moneda en pesos colombianos', () => {
    expect(formatearValor('10000.00', { label: 'P', formato: 'moneda' })).toBe(
      '$10.000',
    );
    expect(formatearMoneda(1234.5)).toBe('$1.234,5');
    expect(formatearMoneda(-1000)).toBe('-$1.000');
  });
  it('porcentaje, booleano y enum', () => {
    expect(formatearValor('19.00', { label: 'I', formato: 'porcentaje' })).toBe(
      '19%',
    );
    expect(formatearValor(true, { label: 'A', formato: 'booleano' })).toBe(
      'Sí',
    );
    expect(formatearValor(false, { label: 'A', formato: 'booleano' })).toBe(
      'No',
    );
    expect(formatearValor('KG', opciones.campos.unidadMedida)).toBe(
      'Kilogramo',
    );
    expect(formatearValor('NO_RESPONSABLE', opciones.campos.unidadMedida)).toBe(
      'No responsable',
    );
  });
  it('fecha en día Colombia dd/mm/aaaa', () => {
    // 02:00 UTC del 3 de octubre = 21:00 del 2 de octubre en Colombia
    expect(
      formatearValor('2026-10-03T02:00:00.000Z', {
        label: 'F',
        formato: 'fecha',
      }),
    ).toBe('02/10/2026');
  });
  it('relación usa la etiqueta resuelta o el id corto', () => {
    const etiquetas = new Map([['uuid-bebidas', 'Bebidas']]);
    expect(
      formatearValor('uuid-bebidas', opciones.campos.marcaId, etiquetas),
    ).toBe('Bebidas');
    expect(
      formatearValor('12345678-aaaa', opciones.campos.marcaId, etiquetas),
    ).toBe('12345678');
  });
  it('relación múltiple lista nombres, null si está vacía', () => {
    const etiquetas = new Map([
      ['a', 'Bebidas'],
      ['b', 'Lácteos'],
    ]);
    expect(
      formatearValor(['b', 'a'], opciones.campos.categorias, etiquetas),
    ).toBe('Bebidas, Lácteos');
    expect(
      formatearValor([], opciones.campos.categorias, etiquetas),
    ).toBeNull();
  });
  it('null queda null', () => {
    expect(formatearValor(null, { label: 'X' })).toBeNull();
  });
});

describe('camposCambiados', () => {
  const antes = {
    nombre: 'Coca',
    precioVenta: '10000.00',
    activo: true,
    passwordHash: 'h1',
    updatedAt: new Date(1),
  };

  it('solo compara la lista blanca e ignora el resto', () => {
    const r = camposCambiados(opciones, antes, {
      ...antes,
      updatedAt: new Date(2),
      precioVenta: 12000,
    });
    expect(r.campos.map((c) => c.campo)).toEqual(['precioVenta']);
    expect(r.secretos).toEqual([]);
  });
  it('no reporta nada si los valores son equivalentes', () => {
    expect(
      camposCambiados(opciones, antes, { ...antes, precioVenta: 10000 }).campos,
    ).toEqual([]);
  });
  it('ignora campos ausentes en el estado nuevo (entidad parcial)', () => {
    expect(camposCambiados(opciones, antes, { nombre: 'Coca' }).campos).toEqual(
      [],
    );
  });
  it('ignora relaciones múltiples que no venían cargadas antes', () => {
    expect(
      camposCambiados(opciones, antes, { ...antes, categorias: [{ id: 'a' }] })
        .campos,
    ).toEqual([]);
  });
  it('el filtro separa columnas de relaciones múltiples', () => {
    const previo = { ...antes, categorias: [{ id: 'a' }] };
    const nuevo = {
      ...previo,
      precioVenta: 12000,
      categorias: [{ id: 'b' }],
      passwordHash: 'h2',
    };
    const columnas = camposCambiados(opciones, previo, nuevo, 'columnas');
    expect(columnas.campos.map((c) => c.campo)).toEqual(['precioVenta']);
    expect(columnas.secretos).toEqual(['passwordHash']);
    const multiples = camposCambiados(
      opciones,
      previo,
      nuevo,
      'relacionesMultiples',
    );
    expect(multiples.campos.map((c) => c.campo)).toEqual(['categorias']);
    expect(multiples.secretos).toEqual([]);
  });
  it('detecta secretos cambiados sin exponerlos', () => {
    expect(
      camposCambiados(opciones, antes, { ...antes, passwordHash: 'h2' })
        .secretos,
    ).toEqual(['passwordHash']);
  });
});

describe('camposIniciales', () => {
  it('incluye los campos con valor salvo activo/activa', () => {
    const r = camposIniciales(opciones, {
      nombre: 'Coca',
      precioVenta: 5000,
      activo: true,
      marcaId: null,
    });
    expect(r.map((c) => c.campo)).toEqual(['nombre', 'precioVenta']);
  });
});

describe('clasificarAccion', () => {
  const campo = (c: string, antes: unknown, despues: unknown) => ({
    campo: c,
    config: { label: c },
    antes,
    despues,
  });
  it('solo activo true→false es DESACTIVAR', () => {
    expect(clasificarAccion([campo('activo', true, false)])).toBe(
      AccionAuditoria.DESACTIVAR,
    );
  });
  it('solo activa false→true es REACTIVAR', () => {
    expect(clasificarAccion([campo('activa', false, true)])).toBe(
      AccionAuditoria.REACTIVAR,
    );
  });
  it('cualquier otra combinación es EDITAR', () => {
    expect(
      clasificarAccion([
        campo('activo', true, false),
        campo('nombre', 'a', 'b'),
      ]),
    ).toBe(AccionAuditoria.EDITAR);
  });
});

describe('construirCambios', () => {
  it('arma etiquetas legibles y enmascara secretos', () => {
    const { campos, secretos } = camposCambiados(
      opciones,
      { precioVenta: '10000.00', passwordHash: 'a' },
      { precioVenta: 12000, passwordHash: 'b' },
    );
    expect(construirCambios(campos, secretos, opciones, new Map())).toEqual([
      {
        campo: 'precioVenta',
        etiqueta: 'Precio de venta',
        antes: '$10.000',
        despues: '$12.000',
      },
      {
        campo: 'passwordHash',
        etiqueta: 'Contraseña',
        antes: null,
        despues: '(cambiado)',
      },
    ]);
  });
});

describe('descripcionAutomatica', () => {
  it('arma la frase según la acción', () => {
    expect(
      descripcionAutomatica(AccionAuditoria.CREAR, 'el producto', 'Coca'),
    ).toBe('Creó el producto "Coca"');
    expect(
      descripcionAutomatica(AccionAuditoria.EDITAR, 'el producto', 'Coca'),
    ).toBe('Editó el producto "Coca"');
    expect(
      descripcionAutomatica(AccionAuditoria.DESACTIVAR, 'el producto', 'Coca'),
    ).toBe('Desactivó el producto "Coca"');
    expect(
      descripcionAutomatica(AccionAuditoria.REACTIVAR, 'el producto', 'Coca'),
    ).toBe('Reactivó el producto "Coca"');
    expect(
      descripcionAutomatica(AccionAuditoria.ELIMINAR, 'el producto', 'Coca'),
    ).toBe('Eliminó el producto "Coca"');
  });
});
