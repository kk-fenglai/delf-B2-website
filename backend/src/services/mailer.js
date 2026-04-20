// Email service — uses SMTP if configured, otherwise logs to console (dev mode).
// Configure via env:
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
// For 163.com:
//   SMTP_HOST=smtp.163.com SMTP_PORT=465 SMTP_SECURE=true
//   SMTP_USER=alzy1210@163.com SMTP_PASS=<授权码(not password)>
//   SMTP_FROM="DELFluent <alzy1210@163.com>"

const nodemailer = require('nodemailer');

let transporter = null;
let mode = 'console';

function init() {
  if (transporter !== null) return;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT || 465),
      secure: String(process.env.SMTP_SECURE ?? 'true') === 'true',
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
    mode = 'smtp';
    console.log(`📧 Mailer: SMTP (${SMTP_HOST})`);
  } else {
    transporter = { sendMail: null }; // sentinel
    mode = 'console';
    console.log('📧 Mailer: console-only (set SMTP_* env vars to send real emails)');
  }
}

async function sendMail({ to, subject, html, text }) {
  init();
  if (mode === 'console') {
    console.log('\n═══════════ 📧 [DEV EMAIL — would send] ═══════════');
    console.log(`To:      ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`Body:    ${text || html}`);
    console.log('═══════════════════════════════════════════════════\n');
    return { mocked: true };
  }
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  return transporter.sendMail({ from, to, subject, html, text });
}

// ---------- Templates ----------

function renderPasswordResetEmail({ name, resetUrl, expiresInMinutes }) {
  const safeName = name || 'there';
  const subject = '[DELFluent] Réinitialisation de votre mot de passe / 密码重置';
  const text = `Bonjour ${safeName},\n\nCliquez sur le lien pour réinitialiser votre mot de passe (valable ${expiresInMinutes} minutes):\n${resetUrl}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.\n\n— DELFluent`;
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:540px;margin:0 auto;padding:24px;color:#1f2937">
      <h2 style="color:#1e40af">DELFluent · 密码重置</h2>
      <p>Bonjour <b>${safeName}</b>,</p>
      <p>我们收到了重置您账户密码的请求。点击下方按钮完成重置（链接 <b>${expiresInMinutes} 分钟</b>内有效）：</p>
      <p style="margin:28px 0"><a href="${resetUrl}" style="background:#1e40af;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block">Réinitialiser / 重置密码</a></p>
      <p style="font-size:12px;color:#6b7280;word-break:break-all">若按钮无法点击，复制此链接到浏览器打开：<br>${resetUrl}</p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
      <p style="font-size:12px;color:#9ca3af">若非本人操作，请忽略此邮件，您的账户仍然安全。<br>— DELFluent Team</p>
    </div>`;
  return { subject, text, html };
}

function renderAdmin2FAEmail({ code, ip, ttlMinutes }) {
  const subject = '[DELFluent] Code de connexion administrateur / 管理员登录验证码';
  const text = `Votre code de connexion: ${code}\nValable ${ttlMinutes} minutes.\nIP: ${ip || 'unknown'}\n\nSi ce n'est pas vous, changez votre mot de passe immédiatement.`;
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:540px;margin:0 auto;padding:24px;color:#1f2937">
      <h2 style="color:#991b1b">🔐 DELFluent Admin · 2FA Code</h2>
      <p>您的管理员登录验证码：</p>
      <p style="font-size:36px;letter-spacing:8px;font-weight:700;background:#fef2f2;padding:16px 24px;border-radius:8px;text-align:center;color:#991b1b">${code}</p>
      <p style="color:#6b7280">有效期：<b>${ttlMinutes} 分钟</b><br>请求 IP：<code>${ip || 'unknown'}</code></p>
      <p style="color:#dc2626;font-size:14px">⚠️ 若非本人操作，请立即修改密码并联系我们。</p>
    </div>`;
  return { subject, text, html };
}

function renderVerifyEmail({ name, verifyUrl, expiresInHours }) {
  const safeName = name || 'there';
  const subject = '[DELFluent] Vérifiez votre adresse e-mail / 请验证您的邮箱';
  const text = `Bonjour ${safeName},\n\nMerci de votre inscription à DELFluent. Veuillez cliquer sur le lien pour activer votre compte (valable ${expiresInHours}h):\n${verifyUrl}\n\nSi vous n'êtes pas à l'origine de cette inscription, ignorez cet e-mail.\n\n— DELFluent`;
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:540px;margin:0 auto;padding:24px;color:#1f2937">
      <h2 style="color:#1e40af">DELFluent · 激活您的账户</h2>
      <p>Bonjour <b>${safeName}</b>，</p>
      <p>欢迎使用 DELFluent！请点击下方按钮验证您的邮箱并激活账户（链接 <b>${expiresInHours} 小时</b>内有效）：</p>
      <p style="margin:28px 0"><a href="${verifyUrl}" style="background:#1e40af;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block">Activer / 激活账户</a></p>
      <p style="font-size:12px;color:#6b7280;word-break:break-all">若按钮无法点击，复制此链接到浏览器打开：<br>${verifyUrl}</p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
      <p style="font-size:12px;color:#9ca3af">若非本人操作，请忽略此邮件。<br>— DELFluent Team</p>
    </div>`;
  return { subject, text, html };
}

function renderAdminPasswordChangedEmail({ name, byAdmin }) {
  const subject = '[DELFluent] 您的密码已被管理员重置';
  const text = `Bonjour ${name || ''},\n\n您的账户密码刚刚被管理员 (${byAdmin}) 重置。若非本人请求，请立即联系我们。\n\n— DELFluent`;
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:540px;margin:0 auto;padding:24px">
      <h2 style="color:#991b1b">⚠️ 密码已被管理员重置</h2>
      <p>Bonjour <b>${name || ''}</b>，您的账户密码刚刚被管理员 <code>${byAdmin}</code> 重置。</p>
      <p>若非本人请求，请立即联系我们：<a href="mailto:alzy1210@163.com">alzy1210@163.com</a></p>
    </div>`;
  return { subject, text, html };
}

module.exports = {
  sendMail,
  renderPasswordResetEmail,
  renderAdmin2FAEmail,
  renderAdminPasswordChangedEmail,
  renderVerifyEmail,
};
