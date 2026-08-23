import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { ArqueoMetodoPago, TurnoCaja } from './entities/turno-caja.entity';
import { MovimientoCaja } from './entities/movimiento-caja.entity';
import { EstadoTurnoCaja, TipoMovimientoCaja } from '../common/enums/caja.enum';
import { MetodosPagoService } from '../metodos-pago/metodos-pago.service';
import { AbrirTurnoDto } from './dto/abrir-turno.dto';
import { CerrarTurnoDto } from './dto/cerrar-turno.dto';
import { RegistrarMovimientoDto } from './dto/registrar-movimiento.dto';
import { PagarDescuadreDto } from './dto/pagar-descuadre.dto';

export interface ResumenTurno {
  montoInicial: number;
  ventasEfectivo: number;
  /** Nombre del método marcado esEfectivo en el catálogo del negocio — puede no haber ninguno. */
  nombreMetodoEfectivo?: string;
  ventasDigitales: { metodoPago: string; total: number }[];
  totalVentasDigitales: number;
  ingresos: number;
  egresos: number;
  retiros: number;
  totalVentas: number;
  efectivoEsperado: number;
}

@Injectable()
export class CajaService {
  constructor(
    @InjectRepository(TurnoCaja)
    private readonly turnosRepository: Repository<TurnoCaja>,
    @InjectRepository(MovimientoCaja)
    private readonly movimientosRepository: Repository<MovimientoCaja>,
    private readonly metodosPagoService: MetodosPagoService,
    private readonly cls: ClsService,
  ) {}

  private getNegocioId(): string {
    return this.cls.get<string>('negocioId');
  }

  private getUsuarioId(): string {
    return this.cls.get<string>('usuarioId');
  }

  findAll(sucursalId?: string) {
    return this.turnosRepository.find({
      where: {
        negocioId: this.getNegocioId(),
        ...(sucursalId ? { sucursalId } : {}),
      },
      relations: { usuarioApertura: true, usuarioCierre: true },
      order: { fechaApertura: 'DESC' },
    });
  }

  async findOne(id: string): Promise<TurnoCaja> {
    const turno = await this.turnosRepository.findOne({
      where: { id, negocioId: this.getNegocioId() },
    });
    if (!turno) {
      throw new NotFoundException(`Turno de caja con ID ${id} no encontrado`);
    }
    return turno;
  }

  async obtenerTurnoAbierto(sucursalId: string): Promise<TurnoCaja> {
    const turno = await this.turnosRepository.findOne({
      where: {
        negocioId: this.getNegocioId(),
        sucursalId,
        estado: EstadoTurnoCaja.ABIERTO,
      },
    });
    if (!turno) {
      throw new BadRequestException(
        'No hay un turno de caja abierto en esta sucursal. Abre un turno antes de vender.',
      );
    }
    return turno;
  }

  async abrirTurno(dto: AbrirTurnoDto): Promise<TurnoCaja> {
    const turnoExistente = await this.turnosRepository.findOne({
      where: {
        negocioId: this.getNegocioId(),
        sucursalId: dto.sucursalId,
        estado: EstadoTurnoCaja.ABIERTO,
      },
    });
    if (turnoExistente) {
      throw new BadRequestException(
        'Ya hay un turno de caja abierto en esta sucursal',
      );
    }

    const turno = this.turnosRepository.create({
      negocioId: this.getNegocioId(),
      sucursalId: dto.sucursalId,
      usuarioAperturaId: this.getUsuarioId(),
      fechaApertura: new Date(),
      montoInicial: dto.montoInicial,
      estado: EstadoTurnoCaja.ABIERTO,
    });
    return this.turnosRepository.save(turno);
  }

  /**
   * Desglose de efectivo vs. pagos digitales de un turno — se muestra antes
   * de cerrar para que el cajero sepa qué debe contar en físico (solo
   * efectivo) y qué ya está conciliado por método digital (tarjeta,
   * transferencia, etc.), sin necesitar contarlo.
   */
  async resumen(id: string): Promise<ResumenTurno> {
    const turno = await this.findOne(id);
    const movimientos = await this.movimientosRepository.find({
      where: { turnoId: id },
    });

    const sumaPor = (predicate: (m: MovimientoCaja) => boolean) =>
      movimientos
        .filter(predicate)
        .reduce((acc, m) => acc + Number(m.monto), 0);

    const metodos = await this.metodosPagoService.findAll();
    const metodoEfectivo = metodos.find((m) => m.esEfectivo);

    const ventasEfectivo = sumaPor(
      (m) =>
        m.tipo === TipoMovimientoCaja.VENTA &&
        m.metodoPago === metodoEfectivo?.nombre,
    );

    const nombresDigitales = metodos.filter((m) => !m.esEfectivo).map((m) => m.nombre);
    const ventasDigitales = nombresDigitales
      .map((metodoPago) => ({
        metodoPago,
        total: sumaPor(
          (m) =>
            m.tipo === TipoMovimientoCaja.VENTA && m.metodoPago === metodoPago,
        ),
      }))
      .filter((v) => v.total > 0);
    const totalVentasDigitales = ventasDigitales.reduce(
      (acc, v) => acc + v.total,
      0,
    );

    const ingresos = sumaPor((m) => m.tipo === TipoMovimientoCaja.INGRESO);
    const egresos = sumaPor((m) => m.tipo === TipoMovimientoCaja.EGRESO);
    const retiros = sumaPor((m) => m.tipo === TipoMovimientoCaja.RETIRO);

    return {
      montoInicial: Number(turno.montoInicial),
      ventasEfectivo,
      nombreMetodoEfectivo: metodoEfectivo?.nombre,
      ventasDigitales,
      totalVentasDigitales,
      ingresos,
      egresos,
      retiros,
      totalVentas: ventasEfectivo + totalVentasDigitales,
      efectivoEsperado:
        Number(turno.montoInicial) +
        ventasEfectivo +
        ingresos -
        egresos -
        retiros,
    };
  }

  async cerrarTurno(id: string, dto: CerrarTurnoDto): Promise<TurnoCaja> {
    const turno = await this.findOne(id);
    if (turno.estado === EstadoTurnoCaja.CERRADO) {
      throw new BadRequestException('Este turno ya está cerrado');
    }

    const resumen = await this.resumen(id);

    const esperadoPorMetodo = new Map<string, number>();
    if (resumen.nombreMetodoEfectivo) {
      esperadoPorMetodo.set(resumen.nombreMetodoEfectivo, resumen.efectivoEsperado);
    }
    for (const digital of resumen.ventasDigitales) {
      esperadoPorMetodo.set(digital.metodoPago, digital.total);
    }

    const contadoPorMetodo = new Map(
      dto.montosContados.map((m) => [m.metodoPago, m.monto]),
    );
    for (const metodoPago of esperadoPorMetodo.keys()) {
      if (!contadoPorMetodo.has(metodoPago)) {
        throw new BadRequestException(
          `Falta el monto contado para el método ${metodoPago}`,
        );
      }
    }

    const arqueoMetodos: ArqueoMetodoPago[] = Array.from(
      esperadoPorMetodo.entries(),
    ).map(([metodoPago, montoEsperado]) => {
      const montoContado = contadoPorMetodo.get(metodoPago)!;
      return {
        metodoPago,
        montoEsperado,
        montoContado,
        diferencia: montoContado - montoEsperado,
      };
    });

    const montoContadoCierre = arqueoMetodos.reduce((sum, a) => sum + a.montoContado, 0);
    const montoEsperadoCierre = arqueoMetodos.reduce((sum, a) => sum + a.montoEsperado, 0);

    turno.estado = EstadoTurnoCaja.CERRADO;
    turno.usuarioCierreId = this.getUsuarioId();
    turno.fechaCierre = new Date();
    turno.montoContadoCierre = montoContadoCierre;
    turno.montoEsperadoCierre = montoEsperadoCierre;
    turno.diferencia = montoContadoCierre - montoEsperadoCierre;
    turno.arqueoMetodos = arqueoMetodos;

    return this.turnosRepository.save(turno);
  }

  async pagarDescuadre(id: string, dto: PagarDescuadreDto): Promise<TurnoCaja> {
    const turno = await this.findOne(id);
    if (turno.estado !== EstadoTurnoCaja.CERRADO) {
      throw new BadRequestException(
        'Solo se puede pagar el descuadre de un turno ya cerrado',
      );
    }
    if (Number(turno.diferencia ?? 0) === 0) {
      throw new BadRequestException('Este turno no tiene descuadre');
    }
    if (turno.descuadrePagado) {
      throw new BadRequestException('El descuadre de este turno ya fue pagado');
    }

    turno.descuadrePagado = true;
    turno.montoPagadoDescuadre = dto.monto;
    turno.usuarioPagoDescuadreId = this.getUsuarioId();
    turno.fechaPagoDescuadre = new Date();

    return this.turnosRepository.save(turno);
  }

  async registrarMovimiento(
    dto: RegistrarMovimientoDto,
  ): Promise<MovimientoCaja> {
    await this.findOne(dto.turnoId);
    return this.registrarMovimientoInterno({
      turnoId: dto.turnoId,
      tipo: dto.tipo,
      monto: dto.monto,
      concepto: dto.concepto,
    });
  }

  /** Usado por VentasService — no expuesto directamente como endpoint manual. */
  async registrarMovimientoInterno(input: {
    turnoId: string;
    tipo: TipoMovimientoCaja;
    monto: number;
    concepto?: string;
    metodoPago?: string;
    ventaId?: string;
  }): Promise<MovimientoCaja> {
    const movimiento = this.movimientosRepository.create({
      negocioId: this.getNegocioId(),
      turnoId: input.turnoId,
      tipo: input.tipo,
      monto: input.monto,
      concepto: input.concepto,
      metodoPago: input.metodoPago,
      ventaId: input.ventaId,
      creadoPor: this.getUsuarioId(),
    });
    return this.movimientosRepository.save(movimiento);
  }

  listarMovimientos(turnoId: string) {
    return this.movimientosRepository.find({
      where: { turnoId, negocioId: this.getNegocioId() },
      order: { createdAt: 'ASC' },
    });
  }
}
