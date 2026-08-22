import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtUserPayload } from '../common/decorators/current-user.decorator';

/**
 * Canal push genérico por negocio — no sabe nada de "alertas" ni de
 * "domicilios" (entidad futura, ver docs/ARQUITECTURA.md). Cualquier
 * servicio de negocio que quiera avisar a las sesiones abiertas de ese
 * negocio llama `emitToNegocio(negocioId, evento, payload)`; hoy solo
 * AlertasService lo usa, el día que exista DomiciliosService lo usa igual,
 * sin tocar este gateway.
 */
@WebSocketGateway({
  cors: {
    origin: (process.env.CORS_ORIGINS ?? 'http://localhost:4200').split(','),
    credentials: true,
  },
})
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  private readonly server: Server;

  constructor(private readonly jwtService: JwtService) {}

  /** Verifica el JWT a mano (los guards HTTP de Nest no aplican a WS) y une el socket a la sala de su negocio. */
  async handleConnection(client: Socket): Promise<void> {
    const token = client.handshake.auth?.['token'] as string | undefined;
    if (!token) {
      this.logger.warn(`Conexión WS rechazada (sin token): ${client.id}`);
      client.disconnect();
      return;
    }

    try {
      const payload = await this.jwtService.verifyAsync<JwtUserPayload>(token);
      if (payload.negocioId) {
        await client.join(this.salaNegocio(payload.negocioId));
      }
      // Tier SISTEMA no entra a ninguna sala — no hay eventos de negocio para él,
      // mismo criterio que ya aplica a Alertas en el sidebar del frontend.
    } catch {
      this.logger.warn(`Conexión WS rechazada (token inválido): ${client.id}`);
      client.disconnect();
    }
  }

  handleDisconnect(): void {
    // No hay estado propio que limpiar — Socket.IO ya saca al cliente de sus salas solo.
  }

  /** Único método que el resto del backend conoce. */
  emitToNegocio(negocioId: string, evento: string, payload: unknown): void {
    this.server.to(this.salaNegocio(negocioId)).emit(evento, payload);
  }

  private salaNegocio(negocioId: string): string {
    return `negocio:${negocioId}`;
  }
}
