import { Controller, Get, NotFoundException, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Public } from '../common/decorators/public.decorator';
import { CatalogoPublicoService } from './catalogo-publico.service';
import { Negocio } from '../negocios/entities/negocio.entity';

@ApiTags('Catálogo público')
@Controller('catalogo-cliente')
export class CatalogoPublicoController {
  constructor(
    private readonly catalogoPublicoService: CatalogoPublicoService,
    @InjectRepository(Negocio)
    private readonly negociosRepository: Repository<Negocio>,
  ) {}

  @Get(':negocioId/productos')
  @Public()
  async obtenerCatalogo(@Param('negocioId', ParseUUIDPipe) negocioId: string) {
    const negocio = await this.negociosRepository.findOne({ where: { id: negocioId } });
    if (!negocio) {
      throw new NotFoundException('Negocio no encontrado');
    }
    return this.catalogoPublicoService.obtenerCatalogo(negocioId);
  }
}
