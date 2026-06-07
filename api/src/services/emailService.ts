import nodemailer from 'nodemailer';

function createTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

export async function sendPasswordReset(to: string, token: string) {
  const url = `${process.env.WEB_APP_URL}/reset-password?token=${token}`;
  const transport = createTransport();
  await transport.sendMail({
    from: process.env.SMTP_USER,
    to,
    subject: 'Family Budget — password reset',
    text: `Click here to reset your password: ${url}\n\nThis link does not expire.`,
    html: `<p>Click <a href="${url}">here</a> to reset your password.</p>`,
  });
}
