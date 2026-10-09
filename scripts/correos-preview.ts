/**
 * Vista previa de los correos (spec 2026-10-08 §6).
 *   npm run correos:preview                           → genera correos-preview/*.html|txt + index.html
 *   npm run correos:preview -- --enviar a@correo.co   → además los envía por Resend con asunto "[Prueba] …"
 */
import { config } from 'dotenv';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { EmailService } from '../src/email/email.service';
import { escapar } from '../src/email/diseno/bloques';
import { VariantePreview, variantesPreview } from '../src/email/preview/variantes';

config({ quiet: true });

const esperar = (ms: number) => new Promise((resolver) => setTimeout(resolver, ms));

function indice(variantes: VariantePreview[]): string {
  const filas = variantes
    .map(
      (v) =>
        `<li><a href="${v.id}.html">${escapar(v.descripcion)}</a> · <a href="${v.id}.txt">texto</a><br><small>${escapar(v.correo.subject)}</small></li>`,
    )
    .join('\n');
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Correos de AURA</title></head><body style="font-family:system-ui,sans-serif;max-width:720px;margin:32px auto;line-height:1.6;"><h1>Correos de AURA — vista previa</h1><ol>${filas}</ol></body></html>`;
}

async function main(): Promise<void> {
  const destino = join(process.cwd(), 'correos-preview');
  mkdirSync(destino, { recursive: true });
  const variantes = variantesPreview();
  for (const v of variantes) {
    writeFileSync(join(destino, `${v.id}.html`), v.correo.html);
    writeFileSync(join(destino, `${v.id}.txt`), v.correo.text);
  }
  writeFileSync(join(destino, 'index.html'), indice(variantes));
  console.log(`${variantes.length} variantes en ${join(destino, 'index.html')}`);

  const i = process.argv.indexOf('--enviar');
  if (i === -1) return;
  const to = process.argv[i + 1];
  if (!to || to.startsWith('--')) {
    console.error('Falta el correo después de --enviar');
    process.exit(1);
  }
  const email = new EmailService();
  let fallos = 0;
  for (const v of variantes) {
    const r = await email.enviar({ to, subject: `[Prueba] ${v.correo.subject}`, html: v.correo.html, text: v.correo.text });
    console.log(`${r.ok ? 'enviado' : 'FALLÓ  '} ${v.id}${r.ok ? '' : ` — ${r.error}`}`);
    if (!r.ok) fallos++;
    await esperar(600); // Resend: máximo ~2 envíos por segundo
  }
  if (fallos) process.exit(1);
}

void main();
