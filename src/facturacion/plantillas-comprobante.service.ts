import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { unlink } from 'fs/promises';
import { join } from 'path';
import { TenantBaseService } from '../common/services/tenant-base.service';
import { PlantillaComprobante } from './entities/plantilla-comprobante.entity';
import { TipoComprobante } from '../common/enums/tipo-comprobante.enum';
import { CreatePlantillaDto } from './dto/create-plantilla.dto';
import { UpdatePlantillaDto } from './dto/update-plantilla.dto';
import { tieneFirmaValida } from '../common/utils/file-signature.util';

@Injectable()
export class PlantillasComprobanteService extends TenantBaseService<PlantillaComprobante> {
  constructor(
    @InjectRepository(PlantillaComprobante)
    repository: Repository<PlantillaComprobante>,
    cls: ClsService,
  ) {
    super(repository, cls, 'Plantilla de comprobante');
  }

  findAll(tipo?: TipoComprobante) {
    return this.findAllForTenant(tipo ? { activo: true, tipo } : { activo: true });
  }

  findOne(id: string) {
    return this.findOneForTenant(id);
  }

  async create(dto: CreatePlantillaDto, logo?: Express.Multer.File): Promise<PlantillaComprobante> {
    if (logo) await this.validarLogo(logo);
    const creadoPor = this.cls.get<string>('usuarioId');
    const plantilla = await this.createForTenant({
      nombre: dto.nombre,
      tipo: dto.tipo,
      esPredeterminada: dto.esPredeterminada ?? false,
      configuracion: dto.configuracion ?? {},
      logoUrl: logo ? this.buildLogoUrl(logo) : undefined,
      creadoPor,
    });
    if (plantilla.esPredeterminada) {
      await this.desmarcarOtrasPredeterminadas(plantilla.id, plantilla.tipo);
    }
    return plantilla;
  }

  async update(id: string, dto: UpdatePlantillaDto, logo?: Express.Multer.File): Promise<PlantillaComprobante> {
    if (logo) await this.validarLogo(logo);
    const plantilla = await this.findOneForTenant(id);
    const logoAnterior = plantilla.logoUrl;

    if (dto.nombre !== undefined) plantilla.nombre = dto.nombre;
    if (dto.tipo !== undefined) plantilla.tipo = dto.tipo;
    if (dto.configuracion !== undefined) plantilla.configuracion = dto.configuracion;
    if (dto.esPredeterminada !== undefined) plantilla.esPredeterminada = dto.esPredeterminada;
    if (logo) plantilla.logoUrl = this.buildLogoUrl(logo);

    const actualizada = await this.repository.save(plantilla);

    if (logo && logoAnterior) {
      await this.eliminarLogo(logoAnterior);
    }
    if (actualizada.esPredeterminada) {
      await this.desmarcarOtrasPredeterminadas(actualizada.id, actualizada.tipo);
    }
    return actualizada;
  }

  async remove(id: string) {
    await this.updateForTenant(id, { activo: false });
  }

  private async desmarcarOtrasPredeterminadas(idExcluido: string, tipo: TipoComprobante): Promise<void> {
    await this.repository.update(
      { negocioId: this.getNegocioId(), tipo, id: Not(idExcluido) },
      { esPredeterminada: false },
    );
  }

  private async validarLogo(logo: Express.Multer.File): Promise<void> {
    if (!(await tieneFirmaValida(logo.path))) {
      await unlink(logo.path).catch(() => {});
      throw new BadRequestException('El logo debe ser una imagen JPG, PNG o WEBP válida');
    }
  }

  private buildLogoUrl(logo: Express.Multer.File): string {
    return `/uploads/plantillas/${logo.filename}`;
  }

  private async eliminarLogo(logoUrl: string): Promise<void> {
    const nombreArchivo = logoUrl.split('/').pop();
    if (!nombreArchivo) return;
    try {
      await unlink(join(process.cwd(), 'uploads', 'plantillas', nombreArchivo));
    } catch {
      // no crítico si ya no existe en disco
    }
  }
}
