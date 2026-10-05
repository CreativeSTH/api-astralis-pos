import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RegistroAuditoria } from './entities/registro-auditoria.entity';
import { AuditoriaService } from './auditoria.service';
import { AuditoriaSubscriber } from './auditoria.subscriber';
import { AuditoriaController } from './auditoria.controller';

/** Global: cualquier service puede inyectar AuditoriaService sin importar el módulo. */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([RegistroAuditoria])],
  controllers: [AuditoriaController],
  providers: [AuditoriaService, AuditoriaSubscriber],
  exports: [AuditoriaService],
})
export class AuditoriaModule {}
