import { BadRequestException, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { NumeracionComprobante } from './entities/numeracion-comprobante.entity';
import { TipoComprobante } from '../common/enums/tipo-comprobante.enum';

function esViolacionUnicidad(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'driverError' in err &&
    (err as { driverError?: { code?: string } }).driverError?.code === '23505'
  );
}

export interface ComprobanteAsignado {
  numero: number;
  numeroFormateado: string;
}

/**
 * Numeración secuencial por sucursal+tipo. Se llama SIEMPRE dentro de la
 * transacción de creación de venta, pasando el `manager` del caller (no
 * abre su propia transacción) — mismo patrón que `crearDomicilioSiAplica`
 * en VentasService. La fila se crea perezosamente en el primer uso, así
 * ninguna sucursal necesita pasar por el wizard de facturación antes de
 * poder vender (nunca bloquea una venta por falta de configuración previa).
 */
@Injectable()
export class NumeracionComprobanteService {
  async siguienteNumero(
    manager: EntityManager,
    negocioId: string,
    sucursalId: string,
    tipo: TipoComprobante,
  ): Promise<ComprobanteAsignado> {
    const repo = manager.getRepository(NumeracionComprobante);

    let numeracion = await repo.findOne({
      where: { sucursalId, tipo },
      lock: { mode: 'pessimistic_write' },
    });

    if (!numeracion) {
      try {
        numeracion = await repo.save(
          repo.create({ negocioId, sucursalId, tipo, siguienteNumero: 1 }),
        );
      } catch (err) {
        if (!esViolacionUnicidad(err)) throw err;
        // Otra venta simultánea ganó la carrera creando la fila — la releemos con lock.
        numeracion = await repo.findOneOrFail({
          where: { sucursalId, tipo },
          lock: { mode: 'pessimistic_write' },
        });
      }
    }

    // El rango solo se exige para FACTURA (numeración de contingencia real) — RECIBO nunca se agota.
    if (numeracion.rangoHasta != null && numeracion.siguienteNumero > numeracion.rangoHasta) {
      const etiqueta = tipo === TipoComprobante.FACTURA ? 'facturas' : 'recibos';
      throw new BadRequestException(
        `Se agotó el rango autorizado para ${etiqueta} de esta sucursal — solicita una nueva resolución en Configuración > Facturación.`,
      );
    }

    const numero = numeracion.siguienteNumero;
    numeracion.siguienteNumero = numero + 1;
    await repo.save(numeracion);

    const numeroFormateado = numeracion.prefijo ? `${numeracion.prefijo}-${numero}` : String(numero);
    return { numero, numeroFormateado };
  }
}
