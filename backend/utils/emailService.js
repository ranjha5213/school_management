const nodemailer = require('nodemailer');
const logger = require('./logger');

let transporter = null;

const isConfigured = () =>
  !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS
      && !process.env.SMTP_PASS.startsWith('PUT_'));

const getTransporter = () => {
  if (transporter) return transporter;
  if (!isConfigured()) return null;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transporter;
};

const send = async (to, subject, text, html) => {
  const tx = getTransporter();
  if (!tx) {
    logger.info(`[email:DEV] to=${to} subject="${subject}"\n${text}`);
    return { dev: true };
  }
  try {
    const info = await tx.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to, subject, text, html,
    });
    logger.info(`[email] sent to=${to} id=${info.messageId}`);
    return { sent: true, id: info.messageId };
  } catch (e) {
    logger.error(`[email] failed to=${to}: ${e.message}`);
    logger.info(`[email:FALLBACK] to=${to} subject="${subject}"\n${text}`);
    return { failed: true, error: e.message };
  }
};

const otpHtml = (code, title, blurb) => `
  <div style="font-family:sans-serif;max-width:420px;margin:auto">
    <h2>${title}</h2>
    <p>${blurb}</p>
    <div style="font-size:32px;font-weight:bold;letter-spacing:6px;
                background:#f3f4f6;padding:16px;text-align:center;border-radius:8px">
      ${code}
    </div>
    <p style="color:#6b7280;font-size:13px;margin-top:16px">Expires in 10 minutes.</p>
  </div>`;

const sendRegistrationOtp = (to, name, code) =>
  send(
    to,
    'Verify your email — School MS',
    `Hi ${name},\n\nYour verification code is: ${code}\n\nExpires in 10 minutes.`,
    otpHtml(code, `Hi ${name},`, 'Use this code to verify your email:')
  );

const sendOtp = (to, code) =>
  send(
    to,
    'Password reset code',
    `Your password reset code is: ${code}\n\nExpires in 10 minutes.`,
    otpHtml(code, 'Password Reset', 'Your code is:')
  );

const sendApprovalEmail = (to, name) =>
  send(
    to,
    'Your account has been approved',
    `Hi ${name},\n\nYour account has been approved. You can now sign in.`,
    `<p>Hi ${name},</p><p>Your account has been approved. You can now sign in.</p>`
  );

const sendRejectionEmail = (to, name, reason) =>
  send(
    to,
    'Registration update',
    `Hi ${name},\n\nYour registration was not approved.${reason ? `\nReason: ${reason}` : ''}`,
    `<p>Hi ${name},</p><p>Your registration was not approved.</p>${reason ? `<p><b>Reason:</b> ${reason}</p>` : ''}`
  );

const sendAdminNewUserAlert = (user) =>
  send(
    process.env.SMTP_USER || 'admin@school.local',
    `New user awaiting approval: ${user.name}`,
    `A new ${user.role} "${user.name}" (${user.email}) verified their email and is awaiting approval.`,
    `<p>New <b>${user.role}</b>: <b>${user.name}</b> (${user.email}) has verified their email and awaits admin approval.</p>`
  );

module.exports = {
  send, sendOtp, sendRegistrationOtp,
  sendApprovalEmail, sendRejectionEmail, sendAdminNewUserAlert,
  isConfigured,
};
