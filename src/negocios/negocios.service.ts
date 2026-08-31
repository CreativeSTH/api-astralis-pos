import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { Negocio } from './entities/negocio.entity';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { RolesService } from '../roles/roles.service';
import { MetodosPagoService } from '../metodos-pago/metodos-pago.service';
import { PaquetesService } from '../paquetes/paquetes.service';
import { SuscripcionesService } from '../suscripciones/suscripciones.service';
import { EmailService } from '../email/email.service';
import { construirCorreoConfirmacion } from '../email/templates/confirmacion-registro.template';
import { CreateNegocioDto } from './dto/create-negocio.dto';
import { UpdateNegocioDto } from './dto/update-negocio.dto';
import { RegistroPublicoDto } from './dto/registro-publico.dto';

@Injectable()
export class NegociosService {
  constructor(
    @InjectRepository(Negocio)
    private readonly negociosRepository: Repository<Negocio>,
    @InjectRepository(Usuario)
    private readonly usuariosRepository: Repository<Usuario>,
    private readonly dataSource: DataSource,
    private readonly rolesService: RolesService,
    private readonly metodosPagoService: MetodosPagoService,
    private readonly paquetesService: PaquetesService,
    private readonly suscripcionesService: SuscripcionesService,
    private readonly emailService: EmailService,
  ) {}

  findAll(): Promise<Negocio[]> {
    return this.negociosRepository.find({
      where: { activo: true },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Negocio> {
    const negocio = await this.negociosRepository.findOne({ where: { id } });
    if (!negocio) {
      throw new NotFoundException(`Negocio con ID ${id} no encontrado`);
    }
    return negocio;
  }

  /**
   * Crea el Negocio, luego asegura sus roles "Administrador"/"Cajero" y sus
   * métodos de pago por defecto, y crea su primer usuario con el rol
   * Administrador. Ese sembrado corre fuera de la transacción del Negocio
   * (los services involucrados no aceptan un EntityManager compartido) — no
   * es 100% atómico, pero es idempotente y el escenario de fallo a mitad de
   * camino es benigno en un sistema en desarrollo activo.
   */
  async create(dto: CreateNegocioDto): Promise<Negocio> {
    const emailExistente = await this.usuariosRepository.findOne({
      where: { email: dto.adminInicial.email },
    });
    if (emailExistente) {
      throw new ConflictException(
        `Ya existe un usuario con el email ${dto.adminInicial.email}`,
      );
    }

    const paqueteFree = await this.paquetesService.asegurarPaqueteFreePorDefecto();

    const negocio = await this.dataSource.transaction(async (manager) => {
      const negocio = manager.create(Negocio, {
        nombre: dto.nombre,
        nit: dto.nit,
        tipoNegocio: dto.tipoNegocio,
        email: dto.email,
        telefono: dto.telefono,
        direccion: dto.direccion,
      });
      return manager.save(negocio);
    });

    await this.suscripcionesService.crearSuscripcionSinVencimiento(negocio.id, paqueteFree.id);

    const { administrador } = await this.rolesService.asegurarRolesPorDefecto(
      negocio.id,
    );
    await this.metodosPagoService.asegurarMetodosPorDefecto(negocio.id);
    const passwordHash = await bcrypt.hash(dto.adminInicial.password, 12);
    const admin = this.usuariosRepository.create({
      negocioId: negocio.id,
      nombre: dto.adminInicial.nombre,
      email: dto.adminInicial.email,
      passwordHash,
      rolId: administrador.id,
      // emailVerificado: true por default en la entidad — un negocio creado
      // por SISTEMA no necesita el flujo de verificación.
    });
    await this.usuariosRepository.save(admin);

    return negocio;
  }

  async registroPublico(dto: RegistroPublicoDto): Promise<{ mensaje: string }> {
    const emailExistente = await this.usuariosRepository.findOne({
      where: { email: dto.adminEmail },
    });
    if (emailExistente) {
      throw new ConflictException(`Ya existe un usuario con el email ${dto.adminEmail}`);
    }

    await this.paquetesService.findOne(dto.paqueteId); // valida que el paquete elegido exista

    const negocio = await this.dataSource.transaction(async (manager) => {
      const negocio = manager.create(Negocio, { nombre: dto.nombreNegocio });
      return manager.save(negocio);
    });

    await this.suscripcionesService.crearSuscripcionPrueba(negocio.id, dto.paqueteId);

    const { administrador } = await this.rolesService.asegurarRolesPorDefecto(negocio.id);
    await this.metodosPagoService.asegurarMetodosPorDefecto(negocio.id);

    const passwordHash = await bcrypt.hash(dto.adminPassword, 12);
    const tokenVerificacion = crypto.randomBytes(32).toString('hex');
    const tokenVerificacionExpira = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const admin = this.usuariosRepository.create({
      negocioId: negocio.id,
      nombre: dto.adminNombre,
      email: dto.adminEmail,
      passwordHash,
      rolId: administrador.id,
      emailVerificado: false,
      tokenVerificacion,
      tokenVerificacionExpira,
    });
    await this.usuariosRepository.save(admin);

    const linkVerificacion = `${process.env.FRONTEND_URL}/verificar-email?token=${tokenVerificacion}`;
    const { subject, html } = construirCorreoConfirmacion(dto.adminNombre, linkVerificacion);
    await this.emailService.enviar({ to: dto.adminEmail, subject, html });

    return { mensaje: 'Cuenta creada — revisá tu correo para confirmarla.' };
  }

  async update(id: string, dto: UpdateNegocioDto): Promise<Negocio> {
    const negocio = await this.findOne(id);
    Object.assign(negocio, dto);
    return this.negociosRepository.save(negocio);
  }

  async remove(id: string): Promise<void> {
    const negocio = await this.findOne(id);
    negocio.activo = false;
    await this.negociosRepository.save(negocio);
  }
}
