import { variantesPreview } from './variantes';

describe('variantesPreview', () => {
  it('15 variantes con id único, asunto, HTML completo y texto plano', () => {
    const variantes = variantesPreview();
    expect(variantes).toHaveLength(15);
    expect(new Set(variantes.map((v) => v.id)).size).toBe(15);
    for (const v of variantes) {
      expect(v.id).toMatch(/^[a-z0-9-]+$/);
      expect(v.correo.subject.length).toBeGreaterThan(0);
      expect(v.correo.html.startsWith('<!DOCTYPE html>')).toBe(true);
      expect(v.correo.text.length).toBeGreaterThan(0);
      expect(v.correo.html).not.toMatch(/undefined|NaN|\bnull\b/);
      expect(v.correo.text).not.toMatch(/undefined|NaN|\bnull\b/);
    }
  });
});
