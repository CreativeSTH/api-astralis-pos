import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { TenantBaseService } from '../common/services/tenant-base.service';
import { Marca } from './entities/marca.entity';
import { CreateMarcaDto } from './dto/create-marca.dto';
import { UpdateMarcaDto } from './dto/update-marca.dto';

@Injectable()
export class MarcasService extends TenantBaseService<Marca> {
  constructor(
    @InjectRepository(Marca) repository: Repository<Marca>,
    cls: ClsService,
  ) {
    super(repository, cls, 'Marca');
  }

  findAll() {
    return this.findAllForTenant({ activo: true });
  }

  findOne(id: string) {
    return this.findOneForTenant(id);
  }

  async create(dto: CreateMarcaDto) {
    if (dto.marcaPadreId) {
      await this.validarMarcaPadre(dto.marcaPadreId);
    }
    return this.createForTenant(dto);
  }

  async update(id: string, dto: UpdateMarcaDto) {
    if (dto.marcaPadreId) {
      if (dto.marcaPadreId === id) {
        throw new BadRequestException(
          'Una marca no puede ser su propia marca padre',
        );
      }
      await this.validarMarcaPadre(dto.marcaPadreId);
    }
    return this.updateForTenant(id, dto);
  }

  async remove(id: string) {
    await this.updateForTenant(id, { activo: false });
  }

  /** Solo se permiten 2 niveles: una sub-marca no puede a su vez tener sub-marcas. */
  private async validarMarcaPadre(marcaPadreId: string): Promise<void> {
    const padre = await this.findOneForTenant(marcaPadreId);
    if (padre.marcaPadreId) {
      throw new BadRequestException(
        'No se puede anidar más de un nivel de sub-marcas — elige la marca principal, no otra sub-marca',
      );
    }
  }
}
