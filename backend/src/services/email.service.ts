import type { Transporter } from "nodemailer";
import { db } from "../lib/firebase-admin";
import { FIRESTORE_COLLECTIONS } from "../lib/firestore-collections";

const REMINDER_POLL_INTERVAL_MS = 60 * 1000;

type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
};

type ReminderJob = {
  job_id: string;
  kind: "WALK_REMINDER";
  participation_id: string;
  walk_id: string;
  user_id: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  scheduled_for: string;
  created_at: string;
  sent_at?: string;
  canceled_at?: string;
  last_error?: string;
};

let transporter: Transporter | null = null;
let reminderWorkerStarted = false;
let reminderWorkerTimer: NodeJS.Timeout | null = null;
let reminderJobRunning = false;

function getEmailConfig() {
  return {
    host: process.env.SMTP_HOST?.trim() ?? "",
    port: Number.parseInt(process.env.SMTP_PORT?.trim() ?? "587", 10),
    user: process.env.SMTP_USER?.trim() ?? "",
    pass: process.env.SMTP_PASS?.trim() ?? "",
    from: process.env.EMAIL_FROM?.trim() ?? "",
    replyTo: process.env.EMAIL_REPLY_TO?.trim() ?? "",
    secure: process.env.SMTP_SECURE?.trim() === "true",
  };
}

export function emailNotificationsEnabled(): boolean {
  const { host, port, user, pass, from } = getEmailConfig();
  return Boolean(host && Number.isFinite(port) && user && pass && from);
}

function toRecipientList(value: string | string[]): string[] {
  const items = Array.isArray(value) ? value : [value];
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

async function getTransporter(): Promise<Transporter> {
  if (transporter) {
    return transporter;
  }

  const { host, port, user, pass, secure } = getEmailConfig();
  const nodemailer = await import("nodemailer");
  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
  });
  return transporter;
}

export async function sendEmail(input: SendEmailInput): Promise<void> {
  if (!emailNotificationsEnabled()) {
    return;
  }

  const { from, replyTo } = getEmailConfig();
  const recipients = toRecipientList(input.to);
  if (recipients.length === 0) {
    return;
  }

  const mailTransporter = await getTransporter();

  await mailTransporter.sendMail({
    from,
    to: recipients.join(", "),
    subject: input.subject,
    html: input.html,
    text: input.text,
    ...(replyTo ? { replyTo } : {}),
  });
}

export function canScheduleReminder(scheduledAtIso: string): boolean {
  const scheduledAt = new Date(scheduledAtIso).getTime();
  if (Number.isNaN(scheduledAt)) {
    return false;
  }
  return scheduledAt > Date.now();
}

export async function saveScheduledReminderJob(
  job: Omit<ReminderJob, "job_id" | "created_at"> & { job_id?: string; created_at?: string },
): Promise<void> {
  const jobId = job.job_id ?? `walk-reminder:${job.participation_id}`;
  await db
    .collection(FIRESTORE_COLLECTIONS.NOTIFICATION_JOBS)
    .doc(jobId)
    .set({
      ...job,
      job_id: jobId,
      created_at: job.created_at ?? new Date().toISOString(),
    });
}

export async function cancelScheduledReminder(participationId: string): Promise<void> {
  const jobRef = db
    .collection(FIRESTORE_COLLECTIONS.NOTIFICATION_JOBS)
    .doc(`walk-reminder:${participationId}`);

  const snapshot = await jobRef.get();
  if (!snapshot.exists) {
    return;
  }

  const job = snapshot.data() as ReminderJob | undefined;
  if (!job || job.sent_at || job.canceled_at) {
    return;
  }

  await jobRef.set({
    ...job,
    canceled_at: new Date().toISOString(),
  });
}

async function processDueReminderJobs(): Promise<void> {
  if (!emailNotificationsEnabled() || reminderJobRunning) {
    return;
  }

  reminderJobRunning = true;

  try {
    const nowIso = new Date().toISOString();
    const snapshot = await db
      .collection(FIRESTORE_COLLECTIONS.NOTIFICATION_JOBS)
      .where("scheduled_for", "<=", nowIso)
      .limit(25)
      .get();

    for (const doc of snapshot.docs) {
      const job = doc.data() as ReminderJob;
      if (job.kind !== "WALK_REMINDER" || job.sent_at || job.canceled_at) {
        continue;
      }

      try {
        await sendEmail({
          to: job.to,
          subject: job.subject,
          html: job.html,
          text: job.text,
        });

        await doc.ref.set({
          ...job,
          sent_at: new Date().toISOString(),
          last_error: null,
        });
      } catch (error) {
        await doc.ref.set({
          ...job,
          last_error: error instanceof Error ? error.message : "Unknown email error",
        });
      }
    }
  } catch (error) {
    console.error("Failed to process reminder jobs", error);
  } finally {
    reminderJobRunning = false;
  }
}

export function startReminderWorker(): void {
  if (reminderWorkerStarted) {
    return;
  }
  reminderWorkerStarted = true;

  void processDueReminderJobs();
  reminderWorkerTimer = setInterval(() => {
    void processDueReminderJobs();
  }, REMINDER_POLL_INTERVAL_MS);
}

export function stopReminderWorker(): void {
  if (reminderWorkerTimer) {
    clearInterval(reminderWorkerTimer);
    reminderWorkerTimer = null;
  }
  reminderWorkerStarted = false;
}
