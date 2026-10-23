import { auth } from "../lib/firebase-admin";
import { config } from "../config";
import { Participation } from "../modules/participation/participation.types";
import { getWalkById } from "../modules/walks/walk.service";
import {
  canScheduleReminder,
  cancelScheduledReminder,
  emailNotificationsEnabled,
  saveScheduledReminderJob,
  sendEmail,
} from "./email.service";

const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;

function formatWalkDate(dateTime: string): string {
  const date = new Date(dateTime);
  if (Number.isNaN(date.getTime())) {
    return dateTime;
  }
  return new Intl.DateTimeFormat("en-SG", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Asia/Singapore",
  }).format(date);
}

function walkLabel(name: string | undefined, walkId: string): string {
  return name?.trim() || `Walk ${walkId}`;
}

function walkUrl(walkId: string): string | null {
  const baseUrl = process.env.APP_BASE_URL?.trim();
  if (!baseUrl) {
    return null;
  }
  return `${baseUrl.replace(/\/$/, "")}/walks/${walkId}`;
}

async function getUserProfile(uid: string): Promise<{ email: string | null; displayName: string }> {
  try {
    const user = await auth.getUser(uid);
    return {
      email: user.email ?? null,
      displayName: user.displayName?.trim() || user.email?.split("@")[0] || "Volunteer",
    };
  } catch {
    return {
      email: null,
      displayName: "Volunteer",
    };
  }
}

export async function notifyWalkSignup(participation: Participation): Promise<void> {
  if (!emailNotificationsEnabled()) {
    return;
  }

  const [walk, user] = await Promise.all([
    getWalkById(participation.walk_id),
    getUserProfile(participation.user_id),
  ]);

  if (!walk || !user.email) {
    return;
  }

  const label = walkLabel(walk.name, walk.walk_id);
  const when = formatWalkDate(walk.date_time);
  const detailsUrl = walkUrl(walk.walk_id);

  await sendEmail({
    to: user.email,
    subject: `You’re signed up for ${label}`,
    text: [
      `Hi ${user.displayName},`,
      ``,
      `You’re confirmed for ${label}.`,
      `When: ${when}`,
      detailsUrl ? `Details: ${detailsUrl}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
    html: [
      `<p>Hi ${user.displayName},</p>`,
      `<p>You’re confirmed for <strong>${label}</strong>.</p>`,
      `<p><strong>When:</strong> ${when}</p>`,
      detailsUrl ? `<p><a href="${detailsUrl}">View walk details</a></p>` : "",
    ].join(""),
  });

  const reminderAt = new Date(new Date(walk.date_time).getTime() - 24 * 60 * 60 * 1000);
  if (!canScheduleReminder(reminderAt.toISOString())) {
    return;
  }

  await saveScheduledReminderJob({
    kind: "WALK_REMINDER",
    participation_id: participation.participation_id,
    walk_id: participation.walk_id,
    user_id: participation.user_id,
    to: user.email,
    subject: `Reminder: ${label} is tomorrow`,
    text: [
      `Hi ${user.displayName},`,
      ``,
      `This is a reminder that ${label} starts tomorrow.`,
      `When: ${when}`,
      detailsUrl ? `Details: ${detailsUrl}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
    html: [
      `<p>Hi ${user.displayName},</p>`,
      `<p>This is a reminder that <strong>${label}</strong> starts tomorrow.</p>`,
      `<p><strong>When:</strong> ${when}</p>`,
      detailsUrl ? `<p><a href="${detailsUrl}">View walk details</a></p>` : "",
    ].join(""),
    scheduled_for: reminderAt.toISOString(),
  });
}

export async function cancelWalkReminderForParticipation(participationId: string): Promise<void> {
  if (!emailNotificationsEnabled()) {
    return;
  }
  await cancelScheduledReminder(participationId);
}

export async function notifyLateWalkCancellation(input: {
  walkId: string;
  canceledByUserId: string;
  remainingParticipantIds: string[];
}): Promise<void> {
  if (!emailNotificationsEnabled()) {
    return;
  }

  const walk = await getWalkById(input.walkId);
  if (!walk) {
    return;
  }

  const startTime = new Date(walk.date_time).getTime();
  if (Number.isNaN(startTime)) {
    return;
  }

  const msUntilStart = startTime - Date.now();
  if (msUntilStart < 0 || msUntilStart > FORTY_EIGHT_HOURS_MS) {
    return;
  }

  const [canceler, ...others] = await Promise.all([
    getUserProfile(input.canceledByUserId),
    ...input.remainingParticipantIds.map((uid) => getUserProfile(uid)),
  ]);

  const recipientEmails = [
    ...config.adminEmails,
    ...others.map((user) => user.email).filter((email): email is string => Boolean(email)),
  ]
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  if (recipientEmails.length === 0) {
    return;
  }

  const label = walkLabel(walk.name, walk.walk_id);
  const when = formatWalkDate(walk.date_time);
  const detailsUrl = walkUrl(walk.walk_id);
  const cancelerLabel = canceler.email
    ? `${canceler.displayName} (${canceler.email})`
    : canceler.displayName;

  await sendEmail({
    to: recipientEmails,
    subject: `Late cancellation for ${label}`,
    text: [
      `${cancelerLabel} canceled within 48 hours of the walk start time.`,
      ``,
      `Walk: ${label}`,
      `Starts: ${when}`,
      detailsUrl ? `Details: ${detailsUrl}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
    html: [
      `<p><strong>${cancelerLabel}</strong> canceled within 48 hours of the walk start time.</p>`,
      `<p><strong>Walk:</strong> ${label}<br/><strong>Starts:</strong> ${when}</p>`,
      detailsUrl ? `<p><a href="${detailsUrl}">View walk details</a></p>` : "",
    ].join(""),
  });
}

export async function notifyWalkCancelledByAdmin(input: {
  walkName?: string;
  walkId: string;
  walkDateTime: string;
  participantIds: string[];
}): Promise<void> {
  if (!emailNotificationsEnabled()) {
    return;
  }

  const recipients = (
    await Promise.all(input.participantIds.map((uid) => getUserProfile(uid)))
  )
    .map((user) => user.email)
    .filter((email): email is string => Boolean(email))
    .map((email) => email.trim().toLowerCase());

  if (recipients.length === 0) {
    return;
  }

  const label = walkLabel(input.walkName, input.walkId);
  const when = formatWalkDate(input.walkDateTime);

  await sendEmail({
    to: recipients,
    subject: `${label} has been cancelled`,
    text: [
      `The walk ${label} scheduled for ${when} has been cancelled by an admin.`,
      "",
      "Please do not turn up for this walk.",
    ].join("\n"),
    html: [
      `<p>The walk <strong>${label}</strong> scheduled for <strong>${when}</strong> has been cancelled by an admin.</p>`,
      `<p>Please do not turn up for this walk.</p>`,
    ].join(""),
  });
}
