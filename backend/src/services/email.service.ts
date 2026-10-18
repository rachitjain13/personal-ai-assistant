
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

function getEmailConfig() {
  const apiKey = process.env.RESEND_API_KEY;

  const from =
    process.env.RESEND_FROM ||
    process.env.SMTP_FROM ||
    "onboarding@resend.dev";

  if (!apiKey) {
    throw new Error(
      "Email is not configured. Add RESEND_API_KEY to the backend environment."
    );
  }

  return { from };
}

export async function sendAuthCodeEmail(
  to: string,
  code: string,
  purpose: "verify_email" | "reset_password"
): Promise<void> {
  const { from } = getEmailConfig();

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
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${heading}</title>
      </head>

      <body style="
        margin: 0;
        padding: 0;
        background: #080808;
        color: #f5f5f5;
        font-family: Arial, Helvetica, sans-serif;
      ">
        <div style="padding: 32px 16px;">
          <div style="
            max-width: 520px;
            margin: 0 auto;
            padding: 28px;
            background: #111111;
            border: 1px solid #292929;
            border-radius: 16px;
          ">
            <h2 style="
              margin-top: 0;
              color: #ffffff;
            ">
              ${heading}
            </h2>

            <p style="
              color: #c4c4c4;
              line-height: 1.6;
            ">
              ${explanation}
            </p>

            <div style="
              margin: 24px 0;
              padding: 18px 12px;
              background: #1c1c1c;
              border-radius: 12px;
              text-align: center;
              font-size: 32px;
              font-weight: 700;
              letter-spacing: 8px;
              color: #ffffff;
            ">
              ${code}
            </div>

            <p style="
              color: #a3a3a3;
              font-size: 13px;
              line-height: 1.6;
            ">
              This code expires in 10 minutes. Never share it with anyone.
            </p>

            <p style="
              color: #737373;
              font-size: 12px;
              line-height: 1.6;
            ">
              If you did not request this, you can safely ignore this email.
            </p>

            <hr style="
              border: none;
              border-top: 1px solid #292929;
              margin: 24px 0;
            " />

            <p style="
              color: #737373;
              font-size: 12px;
              text-align: center;
            ">
              Personal AI Assistant
            </p>
          </div>
        </div>
      </body>
    </html>
  `;

  try {
    const { data, error } = await resend.emails.send({
      from: `Personal AI Assistant <${from}>`,
      to: [to],
      subject,
      text,
      html,
    });

    if (error) {
      console.error("Resend email delivery error:", {
        message: error.message,
        name: error.name,
      });

      throw new Error("Unable to send verification email.");
    }

    console.log("Authentication email accepted by Resend:", {
      emailId: data?.id,
      purpose,
    });
  } catch (error) {
    console.error(
      "Failed to send authentication email:",
      error instanceof Error ? error.message : "Unknown email error"
    );

    throw error;
  }
}

