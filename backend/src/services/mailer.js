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
    console.log('\n═══════════ 📧 [邮件未真实发送 — 仅控制台] ═══════════');
    console.log('提示：邮箱收件箱不会出现此邮件。请在 backend/.env 配置 SMTP_HOST、SMTP_USER、SMTP_PASS（及可选 SMTP_FROM）后重启服务。');
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

// Customer-facing emails are rendered in the language the user picked in the UI
// (passed through from the frontend i18n). Falls back to zh — same as the
// frontend's fallbackLng — for missing/unknown values.
function normalizeLocale(locale) {
  const l = String(locale || '').toLowerCase().slice(0, 2);
  return l === 'en' || l === 'fr' ? l : 'zh';
}

function emailShell({ heading, bodyHtml }) {
  return `
    <div style="font-family:system-ui,sans-serif;max-width:540px;margin:0 auto;padding:24px;color:#1f2937">
      <h2 style="color:#1e40af">${heading}</h2>
      ${bodyHtml}
    </div>`;
}

function renderPasswordResetEmail({ name, resetUrl, expiresInMinutes, locale }) {
  const lng = normalizeLocale(locale);
  const greetName = name ? `<b>${name}</b>` : '';
  const t = {
    zh: {
      subject: '[DELFluent] 密码重置',
      heading: 'DELFluent · 密码重置',
      greet: name ? `您好 ${greetName}，` : '您好，',
      intro: `我们收到了重置您账户密码的请求。点击下方按钮完成重置（链接 <b>${expiresInMinutes} 分钟</b>内有效）：`,
      btn: '重置密码',
      fallback: '若按钮无法点击，请复制此链接到浏览器打开：',
      footer: '若非本人操作，请忽略此邮件，您的账户仍然安全。',
      text: `您好 ${name || ''}，\n\n点击以下链接重置您的密码（${expiresInMinutes} 分钟内有效）：\n${resetUrl}\n\n若非本人操作，请忽略此邮件。\n\n— DELFluent`,
    },
    en: {
      subject: '[DELFluent] Reset your password',
      heading: 'DELFluent · Password reset',
      greet: name ? `Hi ${greetName},` : 'Hi,',
      intro: `We received a request to reset your password. Click the button below to set a new one (link valid for <b>${expiresInMinutes} minutes</b>):`,
      btn: 'Reset password',
      fallback: "If the button doesn't work, copy this link into your browser:",
      footer: "If you didn't request this, you can safely ignore this email.",
      text: `Hi ${name || ''},\n\nClick the link to reset your password (valid for ${expiresInMinutes} minutes):\n${resetUrl}\n\nIf you didn't request this, ignore this email.\n\n— DELFluent`,
    },
    fr: {
      subject: '[DELFluent] Réinitialisation de votre mot de passe',
      heading: 'DELFluent · Réinitialisation du mot de passe',
      greet: name ? `Bonjour ${greetName},` : 'Bonjour,',
      intro: `Nous avons reçu une demande de réinitialisation de votre mot de passe. Cliquez sur le bouton ci-dessous (lien valable <b>${expiresInMinutes} minutes</b>) :`,
      btn: 'Réinitialiser le mot de passe',
      fallback: "Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :",
      footer: "Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.",
      text: `Bonjour ${name || ''},\n\nCliquez sur le lien pour réinitialiser votre mot de passe (valable ${expiresInMinutes} minutes) :\n${resetUrl}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.\n\n— DELFluent`,
    },
  }[lng];

  const html = emailShell({
    heading: t.heading,
    bodyHtml: `
      <p>${t.greet}</p>
      <p>${t.intro}</p>
      <p style="margin:28px 0"><a href="${resetUrl}" style="background:#1e40af;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block">${t.btn}</a></p>
      <p style="font-size:12px;color:#6b7280;word-break:break-all">${t.fallback}<br>${resetUrl}</p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
      <p style="font-size:12px;color:#9ca3af">${t.footer}<br>— DELFluent Team</p>`,
  });
  return { subject: t.subject, text: t.text, html };
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

function renderVerifyEmail({ name, verifyUrl, expiresInHours, locale }) {
  const lng = normalizeLocale(locale);
  const greetName = name ? `<b>${name}</b>` : '';
  const t = {
    zh: {
      subject: '[DELFluent] 请验证您的邮箱',
      heading: 'DELFluent · 激活您的账户',
      greet: name ? `您好 ${greetName}，` : '您好，',
      intro: `欢迎使用 DELFluent！请点击下方按钮验证您的邮箱并激活账户（链接 <b>${expiresInHours} 小时</b>内有效）：`,
      btn: '激活账户',
      fallback: '若按钮无法点击，请复制此链接到浏览器打开：',
      footer: '若非本人操作，请忽略此邮件。',
      text: `您好 ${name || ''}，\n\n欢迎注册 DELFluent。请点击以下链接激活您的账户（${expiresInHours} 小时内有效）：\n${verifyUrl}\n\n若非本人操作，请忽略此邮件。\n\n— DELFluent`,
    },
    en: {
      subject: '[DELFluent] Verify your email address',
      heading: 'DELFluent · Activate your account',
      greet: name ? `Hi ${greetName},` : 'Hi,',
      intro: `Welcome to DELFluent! Click the button below to verify your email and activate your account (link valid for <b>${expiresInHours} hours</b>):`,
      btn: 'Activate account',
      fallback: "If the button doesn't work, copy this link into your browser:",
      footer: "If you didn't sign up, you can safely ignore this email.",
      text: `Hi ${name || ''},\n\nThanks for signing up for DELFluent. Click the link to activate your account (valid for ${expiresInHours}h):\n${verifyUrl}\n\nIf you didn't sign up, ignore this email.\n\n— DELFluent`,
    },
    fr: {
      subject: '[DELFluent] Vérifiez votre adresse e-mail',
      heading: 'DELFluent · Activez votre compte',
      greet: name ? `Bonjour ${greetName},` : 'Bonjour,',
      intro: `Bienvenue sur DELFluent ! Cliquez sur le bouton ci-dessous pour vérifier votre e-mail et activer votre compte (lien valable <b>${expiresInHours} heures</b>) :`,
      btn: 'Activer le compte',
      fallback: "Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :",
      footer: "Si vous n'êtes pas à l'origine de cette inscription, ignorez cet e-mail.",
      text: `Bonjour ${name || ''},\n\nMerci de votre inscription à DELFluent. Cliquez sur le lien pour activer votre compte (valable ${expiresInHours}h) :\n${verifyUrl}\n\nSi vous n'êtes pas à l'origine de cette inscription, ignorez cet e-mail.\n\n— DELFluent`,
    },
  }[lng];

  const html = emailShell({
    heading: t.heading,
    bodyHtml: `
      <p>${t.greet}</p>
      <p>${t.intro}</p>
      <p style="margin:28px 0"><a href="${verifyUrl}" style="background:#1e40af;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block">${t.btn}</a></p>
      <p style="font-size:12px;color:#6b7280;word-break:break-all">${t.fallback}<br>${verifyUrl}</p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
      <p style="font-size:12px;color:#9ca3af">${t.footer}<br>— DELFluent Team</p>`,
  });
  return { subject: t.subject, text: t.text, html };
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

/** Admin changed their own password in the console (not a super-admin reset of another user). */
function renderAdminSelfPasswordChangedEmail({ name, email }) {
  const safeName = name || '';
  const subject = '[DELFluent] Admin password updated / 管理员密码已修改';
  const text = `Bonjour ${safeName},\n\nThe password for DELFluent admin account ${email} was just changed. If this was not you, secure the account immediately.\n\n— DELFluent`;
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:540px;margin:0 auto;padding:24px;color:#1f2937">
      <h2 style="color:#1e40af">DELFluent Admin · 密码已修改</h2>
      <p>您好 <b>${safeName}</b>，</p>
      <p>管理员账户 <code>${email}</code> 的登录密码刚刚在后台被修改。</p>
      <p style="color:#6b7280;font-size:14px">若非本人操作，请尽快检查服务器安全并重置密码。</p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
      <p style="font-size:12px;color:#9ca3af">— DELFluent</p>
    </div>`;
  return { subject, text, html };
}

function getMailerMode() {
  init();
  return mode;
}

module.exports = {
  sendMail,
  getMailerMode,
  renderPasswordResetEmail,
  renderAdmin2FAEmail,
  renderAdminPasswordChangedEmail,
  renderAdminSelfPasswordChangedEmail,
  renderVerifyEmail,
};
