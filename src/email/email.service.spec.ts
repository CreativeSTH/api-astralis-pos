const send = jest.fn();
jest.mock('resend', () => ({ Resend: jest.fn().mockImplementation(() => ({ emails: { send } })) }));

import { EmailService } from './email.service';

describe('EmailService', () => {
  const original = { ...process.env };
  afterEach(() => {
    process.env = { ...original };
    send.mockReset();
  });

  it('sin RESEND_API_KEY no envía y devuelve el error', async () => {
    delete process.env.RESEND_API_KEY;
    const resultado = await new EmailService().enviar({ to: 'a@b.co', subject: 's', html: 'h' });
    expect(resultado).toEqual({ ok: false, error: 'RESEND_API_KEY no configurada' });
    expect(send).not.toHaveBeenCalled();
  });

  it('pasa adjuntos, replyTo y el nombre del remitente con el correo configurado', async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.RESEND_FROM_EMAIL = 'AURA <noreply@somosaura.dev>';
    send.mockResolvedValue({ error: null });
    const resultado = await new EmailService().enviar({
      to: 'a@b.co',
      subject: 's',
      html: 'h',
      nombreRemitente: 'El "Clavo"',
      replyTo: 'negocio@b.co',
      adjuntos: [{ filename: 'FE1.zip', content: Buffer.from('x'), contentType: 'application/zip' }],
    });
    expect(resultado).toEqual({ ok: true });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'El Clavo vía AURA <noreply@somosaura.dev>',
        replyTo: 'negocio@b.co',
        attachments: [{ filename: 'FE1.zip', content: Buffer.from('x'), contentType: 'application/zip' }],
      }),
    );
  });

  it('un error de Resend se devuelve, no se lanza', async () => {
    process.env.RESEND_API_KEY = 're_test';
    send.mockResolvedValue({ error: { message: 'domain not verified' } });
    const resultado = await new EmailService().enviar({ to: 'a@b.co', subject: 's', html: 'h' });
    expect(resultado).toEqual({ ok: false, error: 'domain not verified' });
  });
});
