import 'reflect-metadata';
import { OpcionesAuditable } from './auditoria.types';

const AUDITABLE_KEY = Symbol('auditoria:auditable');

/** Marca una entidad para la auditoría automática (spec §3). Sin esto, el subscriber la ignora. */
export function Auditable<T>(opciones: OpcionesAuditable<T>): ClassDecorator {
  return (target) => Reflect.defineMetadata(AUDITABLE_KEY, opciones, target);
}

export function opcionesAuditable(
  target: unknown,
): OpcionesAuditable | undefined {
  if (typeof target !== 'function') return undefined;
  return Reflect.getMetadata(AUDITABLE_KEY, target) as
    OpcionesAuditable | undefined;
}
