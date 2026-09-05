import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsuariosService } from './usuarios.service';
import { UsuariosController } from './usuarios.controller';
import { Usuario } from './entities/usuario.entity';
import { RolesModule } from '../roles/roles.module';
import { EmailVerificadoGuard } from '../common/guards/email-verificado.guard';

@Module({
  imports: [TypeOrmModule.forFeature([Usuario]), RolesModule],
  controllers: [UsuariosController],
  providers: [UsuariosService, EmailVerificadoGuard],
  exports: [UsuariosService],
})
export class UsuariosModule {}
