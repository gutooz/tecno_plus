import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createTransport } from 'nodemailer';

function parseArgs(argv) {
  const args = { envFile: '.env', sendTo: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--env') args.envFile = argv[++index] ?? args.envFile;
    if (arg === '--send-to') args.sendTo = argv[++index] ?? '';
  }
  return args;
}

function loadEnv(file) {
  const envPath = path.resolve(file);
  const text = fs.readFileSync(envPath, 'utf8');
  const env = {};

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 0) continue;

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }

  return env;
}

function required(env, key) {
  if (!env[key]) throw new Error(`Variavel obrigatoria ausente: ${key}`);
  return env[key];
}

function buildTransport(env) {
  const user = required(env, 'SMTP_USER');
  const pass = env.SMTP_PASS ?? '';
  const clientId = env.SMTP_OAUTH_CLIENT_ID ?? '';
  const clientSecret = env.SMTP_OAUTH_CLIENT_SECRET ?? '';
  const refreshToken = env.SMTP_OAUTH_REFRESH_TOKEN ?? '';

  const auth =
    clientId && clientSecret && refreshToken
      ? { type: 'OAuth2', user, clientId, clientSecret, refreshToken }
      : pass
        ? { user, pass }
        : null;

  if (!auth) {
    throw new Error('Configure SMTP_PASS ou SMTP_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN.');
  }

  return createTransport({
    host: required(env, 'SMTP_HOST'),
    port: Number(env.SMTP_PORT || 587),
    secure: env.SMTP_SECURE === 'true',
    auth,
  });
}

async function sendWithResend(env, sendTo) {
  const apiKey = required(env, 'RESEND_API_KEY');
  const from = required(env, 'RESEND_FROM');
  const appName = env.EMAIL_APP_NAME || 'Tecno Plus';
  const publicUrl = (env.PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
  const replyTo = env.EMAIL_REPLY_TO || env.SMTP_USER || '';

  if (!sendTo) {
    console.log(`Resend configurado: ${from}`);
    console.log('Use --send-to para enviar um email real de teste.');
    return;
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [sendTo],
      subject: `Bem-vindo ao ${appName}`,
      text:
        `Ola!\n\nSua conta no ${appName} foi criada com sucesso.\n\n` +
        `Acesse: ${publicUrl}/login\n\n` +
        'Este e um envio de teste da configuracao de email.',
      html:
        `<p>Ola!</p><p>Sua conta no <strong>${appName}</strong> foi criada com sucesso.</p>` +
        `<p><a href="${publicUrl}/login">Entrar no sistema</a></p>` +
        '<p>Este e um envio de teste da configuracao de email.</p>',
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Resend ${response.status}: ${data.message || data.error || response.statusText}`);
  }

  console.log(`Email de teste enviado para ${sendTo} via Resend (${data.id || 'sem id'})`);
}

async function main() {
  const { envFile, sendTo } = parseArgs(process.argv.slice(2));
  const env = loadEnv(envFile);
  const provider = env.EMAIL_PROVIDER || (env.RESEND_API_KEY ? 'resend' : 'smtp');

  if (provider === 'resend') {
    await sendWithResend(env, sendTo);
    return;
  }

  const transporter = buildTransport(env);

  await transporter.verify();
  console.log(`SMTP OK: ${env.SMTP_HOST}:${env.SMTP_PORT || 587} como ${env.SMTP_USER}`);

  if (!sendTo) return;

  const appName = env.EMAIL_APP_NAME || 'Tecno Plus';
  const publicUrl = (env.PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
  const from = env.SMTP_FROM || env.SMTP_USER;

  await transporter.sendMail({
    from,
    to: sendTo,
    subject: `Bem-vindo ao ${appName}`,
    text:
      `Ola!\n\nSua conta no ${appName} foi criada com sucesso.\n\n` +
      `Acesse: ${publicUrl}/login\n\n` +
      'Este e um envio de teste da configuracao de email.',
    html:
      `<p>Ola!</p><p>Sua conta no <strong>${appName}</strong> foi criada com sucesso.</p>` +
      `<p><a href="${publicUrl}/login">Entrar no sistema</a></p>` +
      '<p>Este e um envio de teste da configuracao de email.</p>',
  });

  console.log(`Email de teste enviado para ${sendTo}`);
}

main().catch((error) => {
  console.error(error?.code ? `${error.code}: ${error.message}` : error.message);
  if (String(error?.message ?? '').includes('SmtpClientAuthentication is disabled')) {
    console.error(
      'Correcao: habilite Authenticated SMTP para a caixa configurada em SMTP_USER no painel Microsoft 365/Outlook Admin, ou configure OAuth2/Graph para envio transacional.',
    );
  }
  process.exit(1);
});
