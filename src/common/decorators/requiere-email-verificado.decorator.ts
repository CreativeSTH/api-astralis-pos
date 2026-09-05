import { SetMetadata } from '@nestjs/common';

export const EMAIL_VERIFICADO_CAMPO_KEY = 'emailVerificadoCampo';

/**
 * Exige emailVerificado=true en el usuario autenticado antes de dejar pasar
 * la request. Sin argumento: exige siempre. Con `campoCondicional`: solo
 * exige cuando ese campo del body es truthy (ej. 'guardarTarjeta') — el
 * resto de la acción (ej. pagar sin guardar tarjeta) no se bloquea.
 */
export const RequiereEmailVerificado = (campoCondicional?: string) =>
  SetMetadata(EMAIL_VERIFICADO_CAMPO_KEY, campoCondicional ?? true);
