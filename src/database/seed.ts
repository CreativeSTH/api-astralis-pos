import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../app.module';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { RolUsuario } from '../common/enums/rol-usuario.enum';

/**
 * Crea el primer usuario SUPER_ADMIN de la plataforma si no existe ninguno.
 * Es la única forma de arrancar: los endpoints de /negocios requieren
 * SUPER_ADMIN y no hay auto-registro para ese rol.
 *
 * Uso: npm run seed
 */
async function seed() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const usuariosRepository = app.get<Repository<Usuario>>(
    getRepositoryToken(Usuario),
  );

  const existente = await usuariosRepository.findOne({
    where: { rol: RolUsuario.SUPER_ADMIN },
  });
  if (existente) {
    console.log(
      `Ya existe un SUPER_ADMIN: ${existente.email}. No se crea otro.`,
    );
    await app.close();
    return;
  }

  const email = process.env.SEED_SUPER_ADMIN_EMAIL ?? 'admin@pos-system.local';
  const password = process.env.SEED_SUPER_ADMIN_PASSWORD ?? 'changeme123';
  const passwordHash = await bcrypt.hash(password, 12);

  const superAdmin = usuariosRepository.create({
    nombre: 'Super Admin',
    email,
    passwordHash,
    rol: RolUsuario.SUPER_ADMIN,
    negocioId: null,
    sucursalId: null,
  });
  await usuariosRepository.save(superAdmin);

  console.log(`SUPER_ADMIN creado: ${email}`);
  await app.close();
}

seed().catch((err) => {
  console.error('Error al crear el seed:', err);
  process.exit(1);
});
