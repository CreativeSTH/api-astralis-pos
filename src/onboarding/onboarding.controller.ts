import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtUserPayload } from '../common/decorators/current-user.decorator';
import { OnboardingService } from './onboarding.service';

@ApiTags('Onboarding')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Get('estado')
  estado(@CurrentUser() usuario: JwtUserPayload) {
    return this.onboardingService.obtenerEstado(usuario.negocioId!);
  }
}
