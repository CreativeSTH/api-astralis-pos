import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { Rol } from '../roles/entities/rol.entity';
import { Negocio } from '../negocios/entities/negocio.entity';
import { PermisosService } from '../roles/permisos.service';
import { ModuloPermiso } from '../common/enums/modulo-permiso.enum';
import { AccionPermiso } from '../common/enums/accion-permiso.enum';
import { RolTier } from '../common/enums/rol-tier.enum';
import { LoginDto } from './dto/login.dto';
import { PinLoginDto } from './dto/pin-login.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(Usuario)
    private readonly usuariosRepository: Repository<Usuario>,
    @InjectRepository(Rol)
    private readonly rolesRepository: Repository<Rol>,
    @InjectRepository(Negocio)
    private readonly negociosRepository: Repository<Negocio>,
    private readonly permisos: PermisosService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Único lugar del sistema donde se busca un Usuario sin conocer aún su
   * negocioId — es justamente lo que el login debe resolver.
   */
  async login(dto: LoginDto) {
    const usuario = await this.usuariosRepository.findOne({
      where: { email: dto.email, activo: true },
    });
    if (!usuario) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const passwordValida = await bcrypt.compare(
      dto.password,
      usuario.passwordHash,
    );
    if (!passwordValida) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    return this.emitirSesion(usuario);
  }

  /**
   * Cambio rápido de cajero: no cierra la sesión del negocio, solo emite un
   * nuevo JWT para el usuario dueño del PIN — dentro del mismo negocioId de
   * quien ya tiene sesión abierta (por eso requiere JwtAuthGuard, no @Public).
   */
  async loginConPin(negocioId: string | null, dto: PinLoginDto) {
    const usuario = await this.verificarPin(negocioId, dto.pin);
    return this.emitirSesion(usuario);
  }

  /**
   * Verifica que un PIN pertenezca a un usuario activo del negocio, **sin**
   * emitir sesión — para aprobaciones puntuales (ej. un cajero cancelando
   * una venta con el PIN de alguien con más permisos) que no deben cambiar
   * quién está logueado. El llamador es responsable de validar el permiso
   * del usuario devuelto para lo que necesite autorizar (ver `autorizarConPin`).
   */
  async verificarPin(negocioId: string | null, pin: string): Promise<Usuario> {
    const candidatos = await this.usuariosRepository.find({
      where: {
        activo: true,
        pinHash: Not(IsNull()),
        ...(negocioId ? { negocioId } : { negocioId: IsNull() }),
      },
    });

    for (const usuario of candidatos) {
      if (usuario.pinHash && (await bcrypt.compare(pin, usuario.pinHash))) {
        return usuario;
      }
    }

    throw new UnauthorizedException('PIN inválido');
  }

  /**
   * Aprobación puntual por PIN: verifica el PIN y que su dueño tenga el
   * permiso indicado, sin emitir sesión. Mecanismo genérico reusable por
   * cualquier flujo de step-up futuro — ver VentasService.cancelar como el
   * primer caso de uso (antes chequeaba `rol === ADMIN_NEGOCIO` a mano).
   */
  async autorizarConPin(
    negocioId: string | null,
    pin: string,
    modulo: ModuloPermiso,
    accion: AccionPermiso,
  ): Promise<Usuario> {
    const usuario = await this.verificarPin(negocioId, pin);
    const autorizado = await this.permisos.rolTienePermiso(
      usuario.rolId,
      modulo,
      accion,
    );
    if (!autorizado) {
      throw new ForbiddenException(
        'Ese PIN no tiene permisos para autorizar esta acción',
      );
    }
    return usuario;
  }

  /**
   * "Entrar como negocio": un usuario de tier SISTEMA (plataforma) emite una
   * sesión como el Administrador de un negocio elegido, para poder operarlo
   * (soporte/configuración) sin necesitar sus credenciales. El frontend es
   * responsable de guardar la sesión de plataforma aparte y ofrecer "Salir"
   * para volver a ella — el backend solo emite un JWT de negocio normal,
   * indistinguible de un login real de ese Administrador.
   */
  async entrarComoNegocio(negocioId: string) {
    const negocio = await this.negociosRepository.findOne({
      where: { id: negocioId },
    });
    if (!negocio || !negocio.activo) {
      throw new NotFoundException('Negocio no encontrado o inactivo');
    }

    const rolAdmin = await this.rolesRepository.findOne({
      where: {
        negocioId,
        tier: RolTier.NEGOCIO,
        nombre: 'Administrador',
        esDefault: true,
      },
    });
    if (!rolAdmin) {
      throw new NotFoundException(
        'Este negocio no tiene un rol "Administrador" configurado',
      );
    }

    const usuario = await this.usuariosRepository.findOne({
      where: { negocioId, rolId: rolAdmin.id, activo: true },
      order: { createdAt: 'ASC' },
    });
    if (!usuario) {
      throw new NotFoundException(
        'Este negocio no tiene un usuario administrador activo',
      );
    }

    return this.emitirSesion(usuario);
  }

  private async emitirSesion(usuario: Usuario) {
    const rol = await this.rolesRepository.findOne({
      where: { id: usuario.rolId },
      relations: { permisos: true },
    });
    if (!rol) {
      throw new UnauthorizedException('El usuario no tiene un rol válido asignado');
    }

    const payload = {
      sub: usuario.id,
      negocioId: usuario.negocioId,
      sucursalId: usuario.sucursalId,
      rolId: rol.id,
      rolTier: rol.tier,
      email: usuario.email,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        rolId: rol.id,
        rolNombre: rol.nombre,
        rolTier: rol.tier,
        negocioId: usuario.negocioId,
        sucursalId: usuario.sucursalId,
      },
      // Foto de conveniencia para la UI (ocultar botones/menús) — nunca la
      // fuente de autorización real, eso siempre lo re-chequea el backend
      // contra la DB (ver PermisosService.rolTienePermiso).
      permisos: rol.permisos.map((p) => ({ modulo: p.modulo, accion: p.accion })),
    };
  }
}
