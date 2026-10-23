import { config } from "../config";
import type { User } from "../schemas/user.schema";
import { sendEmail } from "./email.service";

function displayName(user: Pick<User, "displayName" | "email" | "uid">): string {
  return user.displayName?.trim() || user.email?.split("@")[0] || user.uid || "Volunteer";
}

function adminUsersUrl(): string | null {
  const baseUrl = process.env.APP_BASE_URL?.trim();
  if (!baseUrl) {
    return null;
  }
  return `${baseUrl.replace(/\/$/, "")}/manage-users`;
}

export async function sendWelcomeEmail(user: User): Promise<void> {
  if (!user.email) {
    return;
  }

  const name = displayName(user);
  const appUrl = process.env.APP_BASE_URL?.trim();

  await sendEmail({
    to: user.email,
    subject: "Welcome to RafflesGo",
    text: [
      `Hi ${name},`,
      "",
      "Welcome to RafflesGo. Your volunteer account is ready.",
      appUrl ? `You can sign in here: ${appUrl}` : null,
    ].filter(Boolean).join("\n"),
    html: [
      `<p>Hi ${name},</p>`,
      `<p>Welcome to <strong>RafflesGo</strong>. Your volunteer account is ready.</p>`,
      appUrl ? `<p><a href="${appUrl}">Open RafflesGo</a></p>` : "",
    ].join(""),
  });
}

export async function sendAdminNewUserReviewEmail(user: User): Promise<void> {
  const recipients = [...new Set(config.adminEmails.map((email) => email.trim()).filter(Boolean))];
  if (recipients.length === 0) {
    return;
  }

  const name = displayName(user);
  const manageUrl = adminUsersUrl();

  await sendEmail({
    to: recipients,
    subject: `New volunteer sign-up: ${name}`,
    text: [
      `${name}${user.email ? ` (${user.email})` : ""} has created a new volunteer account.`,
      "",
      "Please review their profile.",
      manageUrl
        ? `User accounts can be managed from the admin pages here: ${manageUrl}`
        : "User accounts can be managed from the admin pages of the website.",
    ].join("\n"),
    html: [
      `<p><strong>${name}</strong>${user.email ? ` (${user.email})` : ""} has created a new volunteer account.</p>`,
      `<p>Please review their profile.</p>`,
      manageUrl
        ? `<p>User accounts can be managed from the <a href="${manageUrl}">admin pages of the website</a>.</p>`
        : `<p>User accounts can be managed from the admin pages of the website.</p>`,
    ].join(""),
  });
}
