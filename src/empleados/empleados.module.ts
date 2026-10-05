import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { Sucursal } from '../sucursales/entities/sucursal.entity';
import { Empleado } from './entities/empleado.entity';
import { TurnoProgramado } from './entities/turno-programado.entity';
import { Jornada } from './entities/jornada.entity';
import { EmpleadosService } from './empleados.service';
import { TurnosProgramadosService } from './turnos-programados.service';
import { AsistenciaService } from './asistencia.service';
import { EmpleadosController } from './empleados.controller';
import { TurnosProgramadosController } from './turnos-programados.controller';
import { AsistenciaController } from './asistencia.controller';
import { RecargosService } from './recargos.service';
import { RecargosController } from './recargos.controller';

/** AuditoriaService llega por AuditoriaModule (@Global). */
@Module({
  imports: [TypeOrmModule.forFeature([Empleado, TurnoProgramado, Jornada, Usuario, Sucursal])],
  controllers: [EmpleadosController, TurnosProgramadosController, AsistenciaController, RecargosController],
  providers: [EmpleadosService, TurnosProgramadosService, AsistenciaService, RecargosService],
  exports: [EmpleadosService],
})
export class EmpleadosModule {}
