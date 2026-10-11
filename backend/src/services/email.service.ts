import nodemailer from "nodemailer";

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || "false").toLowerCase() === "true";

  if (!host || !user || !pass) {
    throw new Error(
      "Email is not configured. Add SMTP_HOST, SMTP_USER, SMTP_PASS and SMTP_FROM to backend .env."
    );
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
}

export async function sendAuthCodeEmail(
  to: string,
  code: string,
  purpose: "verify_email" | "reset_password"
) {
  const transporter = getTransporter();
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;

  const isVerify = purpose === "verify_email";
  const subject = isVerify
    ? "Verify your Personal AI Assistant email"
    : "Reset your Personal AI Assistant password";
  const heading = isVerify ? "Verify your email" : "Reset your password";
  const explanation = isVerify
    ? "Enter this code in Personal AI Assistant to verify that you can access this email address."
    : "Enter this code in Personal AI Assistant to choose a new password.";

  await transporter.sendMail({
    from: `Personal AI Assistant <${from}>`,
    to,
    subject,
    text: `${heading}\n\n${explanation}\n\nYour verification code is: ${code}\n\nThis code expires in 10 minutes. If you did not request this, you can ignore this email.`,
    html: `
      <div style="background:#080808;color:#f5f5f5;padding:32px;font-family:Arial,sans-serif">
        <div style="max-width:520px;margin:auto;border:1px solid #292929;border-radius:16px;padding:28px;background:#111">
          <h2 style="margin-top:0">${heading}</h2>
          <p style="color:#c4c4c4;line-height:1.6">${explanation}</p>
          <div style="font-size:32px;letter-spacing:8px;font-weight:700;padding:18px 12px;text-align:center;background:#1c1c1c;border-radius:12px;margin:24px 0">${code}</div>
          <p style="color:#a3a3a3;font-size:13px">This code expires in 10 minutes. Never share it with anyone.</p>
          <p style="color:#737373;font-size:12px">If you did not request this, you can safely ignore this email.</p>
        </div>
      </div>
    `,
  });
}
