import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';

interface MailPayload {
  to: string;
  subject: string;
  text: string;
  html: string;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly config: ConfigService) {}

  private getReplyTo() {
    return this.config.get<string>('email.replyTo') || undefined;
  }

  private getFrom() {
    return (
      this.config.get<string>('email.resendFrom') ||
      this.config.get<string>('email.from') ||
      this.config.get<string>('email.user') ||
      ''
    );
  }

  private getTransporter(): Transporter | null {
    const host = this.config.get<string>('email.host');
    const user = this.config.get<string>('email.user');
    const pass = this.config.get<string>('email.pass');
    const clientId = this.config.get<string>('email.oauthClientId');
    const clientSecret = this.config.get<string>('email.oauthClientSecret');
    const refreshToken = this.config.get<string>('email.oauthRefreshToken');
    if (!host || !user) return null;

    const auth =
      clientId && clientSecret && refreshToken
        ? { type: 'OAuth2' as const, user, clientId, clientSecret, refreshToken }
        : pass
          ? { user, pass }
          : null;
    if (!auth) return null;

    this.transporter ??= createTransport({
      host,
      port: this.config.get<number>('email.port') ?? 587,
      secure: this.config.get<boolean>('email.secure') ?? false,
      auth,
    });
    return this.transporter;
  }

  private async sendWithResend(payload: MailPayload, from: string) {
    const apiKey = this.config.get<string>('email.resendApiKey');
    if (!apiKey) return null;

    const replyTo = this.getReplyTo();
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [payload.to],
        subject: payload.subject,
        text: payload.text,
        html: payload.html,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    });

    const data = (await response.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
      name?: string;
      error?: string;
    };
    if (!response.ok) {
      throw new Error(
        `Resend ${response.status}: ${data.message ?? data.error ?? data.name ?? response.statusText}`,
      );
    }
    return { sent: true, provider: 'resend', id: data.id };
  }

  private async sendMail(payload: MailPayload) {
    const from = this.getFrom();
    if (!from) {
      this.logger.warn(`Email sem remetente configurado; nao enviado para ${payload.to}`);
      return { sent: false };
    }

    const provider = this.config.get<string>('email.provider') ?? 'smtp';
    if (provider === 'resend' || provider === 'auto') {
      const resendResult = await this.sendWithResend(payload, from);
      if (resendResult) return resendResult;
      if (provider === 'resend') {
        this.logger.warn(`Resend nao configurado; email nao enviado para ${payload.to}`);
        return { sent: false };
      }
    }

    const transporter = this.getTransporter();
    if (!transporter) {
      this.logger.warn(
        `Nenhum provedor de email configurado; email nao enviado para ${payload.to}`,
      );
      return { sent: false };
    }

    await transporter.sendMail({
      from,
      to: payload.to,
      replyTo: this.getReplyTo(),
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
    });
    return { sent: true, provider: 'smtp' };
  }

  async sendPasswordReset(to: string, link: string, expiresMinutes: number) {
    const appName = this.config.get<string>('email.appName') ?? 'Tecno Plus';
    const replyTo = this.getReplyTo();
    return this.sendMail({
      to,
      subject: `Recuperacao de senha - ${appName}`,
      text:
        `Recebemos um pedido para redefinir sua senha no ${appName}.\n\n` +
        `Acesse este link em ate ${expiresMinutes} minutos:\n${link}\n\n` +
        'Se voce nao pediu isso, ignore este e-mail.' +
        (replyTo ? `\n\nPrecisa de ajuda? Responda para ${replyTo}.` : ''),
      html:
        `<p>Recebemos um pedido para redefinir sua senha no <strong>${appName}</strong>.</p>` +
        `<p><a href="${link}">Clique aqui para criar uma nova senha</a>.</p>` +
        `<p>Este link expira em ${expiresMinutes} minutos.</p>` +
        '<p>Se voce nao pediu isso, ignore este e-mail.</p>' +
        (replyTo
          ? `<p>Precisa de ajuda? Responda para <strong>${escapeHtml(replyTo)}</strong>.</p>`
          : ''),
    });
  }

  async sendWelcome(to: string, name?: string) {
    const appName = this.config.get<string>('email.appName') ?? 'Tecno Plus';
    const publicUrl = (this.config.get<string>('app.publicUrl') ?? 'http://localhost:3000')
      .replace(/\/+$/, '')
      .replace(/\/api$/i, '');
    const firstName = escapeHtml(name?.trim() ? name.trim().split(/\s+/)[0] : 'tudo bem');
    const safeAppName = escapeHtml(appName);

    return this.sendMail({
      to,
      subject: `Bem-vindo ao ${appName}`,
      text:
        `Ola, ${firstName}!\n\n` +
        `Sua conta no ${appName} foi criada com sucesso.\n\n` +
        `Acesse: ${publicUrl}/login\n\n` +
        'Primeiros passos: envie fotos dos produtos, revise a ficha gerada pela IA e publique nos canais conectados.\n\n' +
        'Se voce nao criou esta conta, responda este e-mail para avisar nossa equipe.',
      html: `
        <div style="margin:0;background:#f5f7fb;padding:32px 16px;font-family:Inter,Segoe UI,Arial,sans-serif;color:#111827;">
          <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:18px;overflow:hidden;box-shadow:0 18px 45px rgba(15,23,42,.08);">
            <div style="background:#0b0f16;padding:28px 30px;color:#ffffff;">
              <div style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#93c5fd;font-weight:700;">${safeAppName}</div>
              <h1 style="margin:10px 0 0;font-size:28px;line-height:1.15;font-weight:800;">Sua conta esta pronta.</h1>
              <p style="margin:12px 0 0;color:#cbd5e1;font-size:15px;line-height:1.6;">Bem-vindo ao painel que transforma fotos em catalogo pronto para vender.</p>
            </div>

            <div style="padding:30px;">
              <p style="margin:0 0 14px;font-size:16px;line-height:1.6;">Ola, <strong>${firstName}</strong>.</p>
              <p style="margin:0;color:#4b5563;font-size:15px;line-height:1.7;">Seu acesso ao <strong>${safeAppName}</strong> foi criado com sucesso. A partir de agora voce pode cadastrar produtos, revisar as sugestoes da IA e organizar sua operacao em um so lugar.</p>

              <a href="${publicUrl}/login" style="display:inline-block;margin:26px 0 24px;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:700;border-radius:12px;padding:13px 20px;">Entrar no sistema</a>

              <div style="border:1px solid #e5e7eb;border-radius:14px;padding:18px;background:#fafafa;">
                <p style="margin:0 0 12px;font-size:14px;font-weight:800;color:#111827;">Comece por aqui</p>
                <div style="margin:0;color:#4b5563;font-size:14px;line-height:1.7;">
                  <p style="margin:0 0 8px;"><strong>1.</strong> Envie as fotos dos produtos.</p>
                  <p style="margin:0 0 8px;"><strong>2.</strong> Confira titulo, descricao, preco e peso sugeridos.</p>
                  <p style="margin:0;"><strong>3.</strong> Publique ou exporte quando tudo estiver revisado.</p>
                </div>
              </div>

              <p style="margin:24px 0 0;color:#6b7280;font-size:13px;line-height:1.6;">Se voce nao criou esta conta, responda este e-mail para avisar nossa equipe.</p>
            </div>
          </div>
          <p style="max-width:620px;margin:16px auto 0;text-align:center;color:#9ca3af;font-size:12px;">${safeAppName} Comercial</p>
        </div>
      `,
    });
  }
}
