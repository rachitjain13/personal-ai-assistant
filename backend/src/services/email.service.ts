
import { google } from "googleapis";

function getGmailClient() {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
  const user = process.env.GMAIL_USER;

  if (!clientId || !clientSecret || !refreshToken || !user) {
    throw new Error(
      "Gmail API is not configured. Check GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN and GMAIL_USER."
    );
  }

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret
  );

  oauth2Client.setCredentials({
    refresh_token: refreshToken,
  });

  const gmail = google.gmail({
    version: "v1",
    auth: oauth2Client,
  });

  return { gmail, user };
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return entities[char];
  });
}

export async function sendAuthCodeEmail(
  to: string,
  code: string,
  purpose: "verify_email" | "reset_password"
): Promise<void> {
  const { gmail, user } = getGmailClient();

  const isVerify = purpose === "verify_email";

  const subject = isVerify
    ? "Verify your Personal AI Assistant email"
    : "Reset your Personal AI Assistant password";

  const heading = isVerify
    ? "Verify your email"
    : "Reset your password";

  const explanation = isVerify
    ? "Enter this code in Personal AI Assistant to verify that you can access this email address."
    : "Enter this code in Personal AI Assistant to choose a new password.";

  const safeHeading = escapeHtml(heading);
  const safeExplanation = escapeHtml(explanation);
  const safeCode = escapeHtml(code);

  const text = [
    heading,
    "",
    explanation,
    "",
    `Your verification code is: ${code}`,
    "",
    "This code expires in 10 minutes. If you did not request this, you can ignore this email.",
  ].join("\n");

  const html = `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${safeHeading}</title>
      </head>
      <body style="margin:0;padding:0;background:#080808;color:#f5f5f5;font-family:Arial,sans-serif">
        <div style="padding:32px 16px">
          <div style="max-width:520px;margin:0 auto;padding:28px;background:#111;border:1px solid #292929;border-radius:16px">
            <h2 style="margin-top:0;color:#fff">${safeHeading}</h2>
            <p style="color:#c4c4c4;line-height:1.6">${safeExplanation}</p>
            <div style="font-size:32px;letter-spacing:8px;font-weight:700;padding:18px 12px;text-align:center;background:#1c1c1c;border-radius:12px;margin:24px 0;color:#fff">${safeCode}</div>
            <p style="color:#a3a3a3;font-size:13px;line-height:1.6">This code expires in 10 minutes. Never share it with anyone.</p>
            <p style="color:#737373;font-size:12px">If you did not request this, you can safely ignore this email.</p>
            <hr style="border:none;border-top:1px solid #292929;margin:24px 0">
            <p style="color:#737373;font-size:12px;text-align:center">Personal AI Assistant</p>
          </div>
        </div>
      </body>
    </html>
  `;

  const normalizeHeader = (value: string) =>
    value.replace(/[\r\n]+/g, " ").trim();

  const safeTo = normalizeHeader(to);
  const safeFrom = normalizeHeader(user);
  const safeSubject = normalizeHeader(subject);

  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeTo) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeFrom)
  ) {
    throw new Error("Invalid sender or recipient email address.");
  }

  const boundary = `boundary_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2)}`;

  const mimeMessage = [
    `From: Personal AI Assistant <${safeFrom}>`,
    `To: ${safeTo}`,
    `Subject: =?UTF-8?B?${Buffer.from(safeSubject).toString("base64")}?=`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(text, "utf8").toString("base64"),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(html, "utf8").toString("base64"),
    `--${boundary}--`,
    "",
  ].join("\r\n");

  try {
    const response = await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: encodeBase64Url(mimeMessage),
      },
    });

    console.log("Authentication email sent through Gmail API:", {
      messageId: response.data.id,
      purpose,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown Gmail API error";

    console.error("Gmail API email delivery failed:", message);

    throw new Error("Unable to send verification email.");
  }
}
