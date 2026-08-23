import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../app.module';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { Negocio } from '../negocios/entities/negocio.entity';
import { RolesService } from '../roles/roles.service';
import { PermisosService } from '../roles/permisos.service';
import { MetodosPagoService } from '../metodos-pago/metodos-pago.service';

/**
 * Bootstrap idempotente — seguro de correr múltiples veces:
 * 1. Siembra el catálogo de Permiso (19 módulos × 4 acciones).
 * 2. Asegura el rol de sistema "Super Administrador" y el primer usuario SUPER_ADMIN.
 * 3. Para cada Negocio existente, asegura sus roles "Administrador"/"Cajero" por defecto.
 * 4. Para cada Negocio existente, asegura sus métodos de pago por defecto.
 *
 * Uso: npm run seed
 */
async function seed() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const usuariosRepository = app.get<Repository<Usuario>>(
    getRepositoryToken(Usuario),
  );
  const negociosRepository = app.get<Repository<Negocio>>(
    getRepositoryToken(Negocio),
  );
  const rolesService = app.get(RolesService, { strict: false });
  const permisosService = app.get(PermisosService, { strict: false });
  const metodosPagoService = app.get(MetodosPagoService, { strict: false });

  console.log('Sembrando catálogo de permisos...');
  await permisosService.sembrarCatalogo();

  console.log('Asegurando rol de sistema "Super Administrador"...');
  const rolSistema = await rolesService.asegurarRolSistema();

  const superAdminExistente = await usuariosRepository.findOne({
    where: { rolId: rolSistema.id },
  });
  if (!superAdminExistente) {
    const email = process.env.SEED_SUPER_ADMIN_EMAIL ?? 'admin@pos-system.local';
    const password = process.env.SEED_SUPER_ADMIN_PASSWORD ?? 'changeme123';
    const passwordHash = await bcrypt.hash(password, 12);
    const superAdmin = usuariosRepository.create({
      nombre: 'Super Admin',
      email,
      passwordHash,
      rolId: rolSistema.id,
      negocioId: null,
      sucursalId: null,
    });
    await usuariosRepository.save(superAdmin);
    console.log(`SUPER_ADMIN creado: ${email}`);
  } else {
    console.log(`Ya existe un SUPER_ADMIN: ${superAdminExistente.email}.`);
  }

  console.log('Asegurando roles por defecto (Administrador/Cajero) de cada negocio...');
  const negocios = await negociosRepository.find();
  for (const negocio of negocios) {
    await rolesService.asegurarRolesPorDefecto(negocio.id);
  }
  console.log(`Roles por defecto verificados para ${negocios.length} negocio(s).`);

  console.log('Asegurando métodos de pago por defecto de cada negocio...');
  for (const negocio of negocios) {
    await metodosPagoService.asegurarMetodosPorDefecto(negocio.id);
  }
  console.log(`Métodos de pago por defecto verificados para ${negocios.length} negocio(s).`);

  await app.close();
}

seed().catch((err) => {
  console.error('Error al correr el seed:', err);
  process.exit(1);
});
