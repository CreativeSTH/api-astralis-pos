import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { TenantBaseService } from '../common/services/tenant-base.service';
import { Categoria } from './entities/categoria.entity';
import { CreateCategoriaDto } from './dto/create-categoria.dto';
import { UpdateCategoriaDto } from './dto/update-categoria.dto';

@Injectable()
export class CategoriasService extends TenantBaseService<Categoria> {
  constructor(
    @InjectRepository(Categoria) repository: Repository<Categoria>,
    cls: ClsService,
  ) {
    super(repository, cls, 'Categoria');
  }

  findAll() {
    return this.findAllForTenant({ activo: true });
  }

  findOne(id: string) {
    return this.findOneForTenant(id);
  }

  async create(dto: CreateCategoriaDto) {
    if (dto.categoriaPadreId) {
      await this.validarCategoriaPadre(dto.categoriaPadreId);
    }
    return this.createForTenant(dto);
  }

  async update(id: string, dto: UpdateCategoriaDto) {
    if (dto.categoriaPadreId) {
      if (dto.categoriaPadreId === id) {
        throw new BadRequestException(
          'Una categoría no puede ser su propia categoría padre',
        );
      }
      await this.validarCategoriaPadre(dto.categoriaPadreId);
    }
    return this.updateForTenant(id, dto);
  }

  async remove(id: string) {
    await this.updateForTenant(id, { activo: false });
  }

  /** Solo se permiten 2 niveles: una sub-categoría no puede a su vez tener sub-categorías. */
  private async validarCategoriaPadre(categoriaPadreId: string): Promise<void> {
    const padre = await this.findOneForTenant(categoriaPadreId);
    if (padre.categoriaPadreId) {
      throw new BadRequestException(
        'No se puede anidar más de un nivel de sub-categorías — elige la categoría principal, no otra sub-categoría',
      );
    }
  }
}
