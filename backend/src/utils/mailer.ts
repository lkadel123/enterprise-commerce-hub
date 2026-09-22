import nodemailer, { type Transporter } from "nodemailer";

import { env } from "../config/env.js";
import { logger } from "./logger.js";
import { serviceUnavailable } from "./ApiError.js";

/**
 * Transactional email transport (production hardening).
 *
 * The mailer is intentionally minimal: it exists so security-critical flows
 * (customer password reset) actually DELIVER their secrets-bearing links
 * instead of silently discarding them. It is driven entirely by the validated
 * SMTP_* environment variables — no credentials are ever logged, and email
 * bodies are built from server-side data only.
 *
 * Failure policy: when SMTP is disabled or delivery fails, callers get a
 * thrown service-unavailable error. A password reset must NEVER appear to
 * succeed while the reset link went nowhere.
 */

/** Singleton transport — created lazily on first send, reused afterwards. */
let transporter: Transporter | null = null;

/** Whether SMTP delivery is enabled via configuration (no side effects). */
export function smtpEnabled(): boolean {
  return env.SMTP_ENABLED;
}

function getTransporter(): Transporter | null {
  if (!env.SMTP_ENABLED) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      ...(env.SMTP_USER
        ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } }
        : {}),
      connectionTimeout: env.SMTP_CONNECTION_TIMEOUT_MS,
      greetingTimeout: env.SMTP_CONNECTION_TIMEOUT_MS,
      socketTimeout: env.SMTP_CONNECTION_TIMEOUT_MS,
    });
  }
  return transporter;
}

/** Test hook: resets the cached transport so env changes take effect. */
export function resetMailerForTests(): void {
  transporter = null;
}

/**
 * Send the customer password-reset email.
 *
 * @param to recipient address (the customer's account email)
 * @param resetUrl absolute reset link built server-side from PUBLIC_BASE_URL.
 *   Contains the one-time reset token — it must never be logged.
 * @throws 503 service-unavailable when SMTP is disabled or delivery fails.
 */
export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  const tx = getTransporter();
  if (!tx) {
    throw serviceUnavailable(
      "Password reset by email is not available. Please contact support.",
    );
  }

  try {
    await tx.sendMail({
      from: env.SMTP_FROM,
      ...(env.SMTP_REPLY_TO ? { replyTo: env.SMTP_REPLY_TO } : {}),
      to,
      subject: "Reset your password",
      text: [
        "We received a request to reset your password.",
        "",
        "Open the link below to choose a new password. The link expires in 24 hours and can be used once.",
        "",
        resetUrl,
        "",
        "If you did not request this, you can safely ignore this email — your password stays unchanged.",
      ].join("\n"),
      html: [
        "<p>We received a request to reset your password.</p>",
        `<p><a href="${resetUrl}">Choose a new password</a></p>`,
        "<p>The link expires in 24 hours and can be used once. If you did not request this, you can safely ignore this email.</p>",
      ].join(""),
    });
  } catch (error) {
    // Log only primitive error metadata — never the message body, the URL,
    // or any credential. The reset URL carries the one-time token.
    logger.error(
      {
        errorType: error instanceof Error ? error.name : typeof error,
        message: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300),
      },
      "Password reset email delivery failed",
    );
    throw serviceUnavailable(
      "Unable to deliver the password reset email. Please try again shortly.",
    );
  }

  logger.info("Password reset email sent");
}
