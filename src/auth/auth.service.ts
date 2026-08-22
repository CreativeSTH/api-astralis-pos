import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { LoginDto } from './dto/login.dto';
import { PinLoginDto } from './dto/pin-login.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(Usuario)
    private readonly usuariosRepository: Repository<Usuario>,
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
  async loginConPin(negocioId: string, dto: PinLoginDto) {
    const usuario = await this.verificarPin(negocioId, dto.pin);
    return this.emitirSesion(usuario);
  }

  /**
   * Verifica que un PIN pertenezca a un usuario activo del negocio, **sin**
   * emitir sesión — para aprobaciones puntuales (ej. un cajero cancelando
   * una venta con el PIN de un admin) que no deben cambiar quién está
   * logueado. El llamador es responsable de validar el rol del usuario
   * devuelto para lo que necesite autorizar.
   */
  async verificarPin(negocioId: string, pin: string): Promise<Usuario> {
    const candidatos = await this.usuariosRepository.find({
      where: { negocioId, activo: true, pinHash: Not(IsNull()) },
    });

    for (const usuario of candidatos) {
      if (usuario.pinHash && (await bcrypt.compare(pin, usuario.pinHash))) {
        return usuario;
      }
    }

    throw new UnauthorizedException('PIN inválido');
  }

  private emitirSesion(usuario: Usuario) {
    const payload = {
      sub: usuario.id,
      negocioId: usuario.negocioId,
      sucursalId: usuario.sucursalId,
      rol: usuario.rol,
      email: usuario.email,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        rol: usuario.rol,
        negocioId: usuario.negocioId,
        sucursalId: usuario.sucursalId,
      },
    };
  }
}
