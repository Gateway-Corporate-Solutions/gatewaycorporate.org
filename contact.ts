import twilio from "twilio";
import { Database } from "sqlite";

const CONTACT_INBOX = "office@gatewaycorporate.org";
const BLOCKED_EMAILS = new Set<string>(
  ([] as string[]).map((value) => value.trim().toLowerCase()),
);

const CONTACT_BOOKINGS_DB_PATH = "./data/contact-bookings.db";
const APPOINTMENT_SLOTS = [
  { id: "10:30-11:00", label: "10:30 AM - 11:00 AM CST" },
  { id: "11:00-11:30", label: "11:00 AM - 11:30 AM CST" },
  { id: "11:30-12:00", label: "11:30 AM - 12:00 PM CST" },
  { id: "12:00-12:30", label: "12:00 PM - 12:30 PM CST" },
] as const;

const SLOT_SCARCITY_ENABLED = !["0", "false", "off"].includes(
  (Deno.env.get("CONTACT_APPOINTMENT_SCARCITY_ENABLED") || "true").trim().toLowerCase(),
);
const SLOT_SCARCITY_RATE = clampNumber(
  Number(Deno.env.get("CONTACT_APPOINTMENT_SCARCITY_RATE") || "0.25"),
  0,
  0.95,
);

type AppointmentSlotId = (typeof APPOINTMENT_SLOTS)[number]["id"];
type ContactIntent = "message" | "appointment";

interface UserRequest {
  name: string;
  email: string;
  phone: string;
  company: string;
  referral: string;
  message: string;
  intent: ContactIntent;
  appointmentDate: string;
  appointmentSlot: AppointmentSlotId | "";
}

interface MailProvider {
  sendContactEmail(request: UserRequest): Promise<void>;
}

class ResendMailProvider implements MailProvider {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly to: string,
  ) {}

  async sendContactEmail(request: UserRequest): Promise<void> {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.from,
        to: [this.to],
        reply_to: request.email,
        subject: `Contact form: ${request.name}`,
        text: renderPlainTextEmail(request),
        html: renderHtmlEmail(request),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Resend request failed with ${response.status}: ${errorText}`);
    }
  }
}

interface ContactRequestOptions {
  bypassCaptcha?: boolean;
}

interface AppointmentBookingRecord {
  id: string;
  appointmentDate: string;
  appointmentSlot: AppointmentSlotId;
}

let bookingsDb: Database | null = null;

function getBookingsDb(): Database {
  if (!bookingsDb) {
    bookingsDb = new Database(CONTACT_BOOKINGS_DB_PATH);
    bookingsDb.prepare(`
      CREATE TABLE IF NOT EXISTS contact_appointments (
        id TEXT PRIMARY KEY,
        appointmentDate TEXT NOT NULL,
        appointmentSlot TEXT NOT NULL,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT,
        company TEXT,
        referral TEXT,
        message TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        UNIQUE(appointmentDate, appointmentSlot)
      )
    `).run();
  }

  return bookingsDb;
}

export async function handleUserRequest(form: URLSearchParams, options?: ContactRequestOptions): Promise<void> {
  const recaptchaToken = sanitizeText(form.get("g-recaptcha-response"), 4000);
  if (!recaptchaToken && !options?.bypassCaptcha) {
    throw new Error("Please complete the reCAPTCHA check before submitting.");
  }

  await verifyRecaptcha(recaptchaToken, options);

  const userRequest = parseUserRequest(form);
  const provider = createMailProvider();

  let bookingRecord: AppointmentBookingRecord | null = null;
  if (userRequest.intent === "appointment") {
    bookingRecord = reserveAppointmentSlot(userRequest);
  }

  try {
    await provider.sendContactEmail(userRequest);
    await sendTwilioNotification(userRequest);
  } catch (error) {
    if (bookingRecord) {
      releaseAppointmentSlot(bookingRecord.id);
    }
    throw error;
  }

  console.log("Contact request submitted", {
    email: userRequest.email,
    referral: userRequest.referral || "not provided",
    intent: userRequest.intent,
    appointmentDate: userRequest.appointmentDate || "not scheduled",
    appointmentSlot: userRequest.appointmentSlot || "not scheduled",
  });
}

export function getAvailableAppointmentSlots(appointmentDate: string): {
  id: AppointmentSlotId;
  label: string;
  available: boolean;
}[] {
  const normalizedDate = sanitizeText(appointmentDate, 20);
  if (!isValidAppointmentDate(normalizedDate)) {
    return APPOINTMENT_SLOTS.map((slot) => ({
      id: slot.id,
      label: slot.label,
      available: false,
    }));
  }

  const db = getBookingsDb();
  const bookedRows = db.prepare(
    `SELECT appointmentSlot FROM contact_appointments WHERE appointmentDate = ?`,
  ).all(normalizedDate) as Array<{ appointmentSlot: AppointmentSlotId }>;

  const booked = new Set(bookedRows.map((row) => row.appointmentSlot));

  return APPOINTMENT_SLOTS.map((slot) => ({
    id: slot.id,
    label: slot.label,
    available: !booked.has(slot.id) && !isSlotScarcityUnavailable(normalizedDate, slot.id),
  }));
}

function createMailProvider(): MailProvider {
  const apiKey = Deno.env.get("RESEND_API_KEY") || "";
  const from = Deno.env.get("CONTACT_EMAIL_FROM") || Deno.env.get("CAREERS_EMAIL_FROM") || "";
  const to = Deno.env.get("CONTACT_EMAIL_TO") || CONTACT_INBOX;

  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured.");
  }

  if (!from) {
    throw new Error("CONTACT_EMAIL_FROM or CAREERS_EMAIL_FROM must be configured.");
  }

  return new ResendMailProvider(apiKey, from, to);
}

function parseUserRequest(form: URLSearchParams): UserRequest {
  const requestedIntent = sanitizeText(form.get("requestType"), 32).toLowerCase();
  const intent: ContactIntent = requestedIntent === "appointment" ? "appointment" : "message";

  const request: UserRequest = {
    name: sanitizeText(form.get("name"), 120),
    email: sanitizeText(form.get("email"), 160),
    phone: sanitizeText(form.get("phone"), 40),
    company: sanitizeText(form.get("company"), 140),
    referral: sanitizeText(form.get("referral"), 100),
    message: sanitizeText(form.get("message"), 2000),
    intent,
    appointmentDate: sanitizeText(form.get("appointmentDate"), 20),
    appointmentSlot: sanitizeText(form.get("appointmentSlot"), 20) as AppointmentSlotId | "",
  };

  if (!request.name || !request.email || !request.message) {
    throw new Error("Please complete all required contact fields.");
  }

  if (!isValidEmail(request.email)) {
    throw new Error("Please provide a valid email address.");
  }

  if (isBlockedEmail(request.email)) {
    throw new Error("Please use a different email address.");
  }

  if (request.intent === "appointment") {
    if (!isValidAppointmentDate(request.appointmentDate)) {
      throw new Error("Please provide a valid appointment date in YYYY-MM-DD format.");
    }

    if (request.appointmentDate < getCurrentCentralDate()) {
      throw new Error("Please choose a current or future date for your appointment.");
    }

    if (!isValidAppointmentSlot(request.appointmentSlot)) {
      throw new Error("Please choose one of the listed thirty-minute appointment slots.");
    }
  } else {
    request.appointmentDate = "";
    request.appointmentSlot = "";
  }

  return request;
}

function reserveAppointmentSlot(request: UserRequest): AppointmentBookingRecord {
  if (request.intent !== "appointment" || !isValidAppointmentSlot(request.appointmentSlot)) {
    throw new Error("Invalid appointment details.");
  }

  if (isSlotScarcityUnavailable(request.appointmentDate, request.appointmentSlot)) {
    throw new Error("That appointment timeslot is currently unavailable. Please choose another slot.");
  }

  const db = getBookingsDb();
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  try {
    db.prepare(`
      INSERT INTO contact_appointments (
        id,
        appointmentDate,
        appointmentSlot,
        name,
        email,
        phone,
        company,
        referral,
        message,
        createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      request.appointmentDate,
      request.appointmentSlot,
      request.name,
      request.email,
      request.phone,
      request.company,
      request.referral,
      request.message,
      createdAt,
    );

    return {
      id,
      appointmentDate: request.appointmentDate,
      appointmentSlot: request.appointmentSlot,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes("unique")) {
      throw new Error("That appointment timeslot has already been booked. Please choose another slot.");
    }

    throw error;
  }
}

function releaseAppointmentSlot(id: string): void {
  const db = getBookingsDb();
  db.prepare("DELETE FROM contact_appointments WHERE id = ?").run(id);
}

function isValidAppointmentDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isValidAppointmentSlot(value: string): value is AppointmentSlotId {
  return APPOINTMENT_SLOTS.some((slot) => slot.id === value);
}

function getCurrentCentralDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function resolveAppointmentSlotLabel(slotId: AppointmentSlotId | ""): string {
  if (!slotId) {
    return "Not scheduled";
  }

  const matched = APPOINTMENT_SLOTS.find((slot) => slot.id === slotId);
  return matched?.label || slotId;
}

function isSlotScarcityUnavailable(appointmentDate: string, slotId: AppointmentSlotId): boolean {
  if (!SLOT_SCARCITY_ENABLED || SLOT_SCARCITY_RATE <= 0) {
    return false;
  }

  const score = stablePseudoRandom01(`${appointmentDate}|${slotId}|scarcity-v1`);
  return score < SLOT_SCARCITY_RATE;
}

function stablePseudoRandom01(seed: string): number {
  // FNV-1a hash for deterministic per-date per-slot pseudo-randomness.
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0) / 4294967295;
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.max(min, Math.min(max, value));
}

async function verifyRecaptcha(token: string, options?: ContactRequestOptions): Promise<void> {
  if (options?.bypassCaptcha) {
    return;
  }

  const recaptchaSecret = Deno.env.get("RECAPTCHA_SECRET_KEY") || "";
  if (!recaptchaSecret) {
    throw new Error("RECAPTCHA_SECRET_KEY is not configured.");
  }

  const response = await fetch("https://www.google.com/recaptcha/api/siteverify", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      secret: recaptchaSecret,
      response: token,
    }),
  });

  if (!response.ok) {
    throw new Error("We could not verify the reCAPTCHA challenge.");
  }

  const payload = await response.json();
  if (!payload.success) {
    throw new Error("reCAPTCHA verification failed. Please try again.");
  }
}

async function sendTwilioNotification(request: UserRequest): Promise<void> {
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID") || "";
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN") || "";
  const twilioNumber = Deno.env.get("TWILIO_NUMBER") || "";
  const notificationNumber = Deno.env.get("NOTIFICATION_NUMBER") || "";

  if (!accountSid || !authToken || !twilioNumber || !notificationNumber) {
    if (request.intent === "appointment") {
      throw new Error("Twilio SMS settings are required for appointment bookings.");
    }
    return;
  }

  const twilioClient = twilio(accountSid, authToken);
  const referralLine = request.referral ? ` Referral: ${request.referral}` : "";
  const phoneLine = request.phone ? ` Phone: ${request.phone}` : "";
  const companyLine = request.company ? ` Company: ${request.company}` : "";
  const bookingLine = request.intent === "appointment"
    ? ` Appointment: ${request.appointmentDate} at ${resolveAppointmentSlotLabel(request.appointmentSlot)}`
    : "";

  await twilioClient.messages.create({
    body: `New ${request.intent === "appointment" ? "appointment request" : "contact request"} from ${request.name} (${request.email}).${phoneLine}${companyLine}${referralLine} ${bookingLine} Message: ${request.message}`,
    from: twilioNumber,
    to: notificationNumber,
  });
}

function sanitizeText(value: string | null, maxLength: number): string {
  return (value || "")
    .replace(/<[^>]+>/g, "")
    .replace(/\r\n/g, "\n")
    .trim()
    .slice(0, maxLength);
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isBlockedEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  return normalized.length > 0 && BLOCKED_EMAILS.has(normalized);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderPlainTextEmail(request: UserRequest): string {
  const bookingLine = request.intent === "appointment"
    ? `${request.appointmentDate} at ${resolveAppointmentSlotLabel(request.appointmentSlot)}`
    : "Not requested";

  return [
    "New contact form submission",
    "",
    `Submitted: ${new Date().toISOString()}`,
    `Request Type: ${request.intent === "appointment" ? "Appointment booking" : "General inquiry"}`,
    `Name: ${request.name}`,
    `Email: ${request.email}`,
    `Phone: ${request.phone || "Not provided"}`,
    `Company: ${request.company || "Not provided"}`,
    `Referral: ${request.referral || "Not provided"}`,
    `Appointment: ${bookingLine}`,
    "",
    "Message:",
    request.message,
  ].join("\n");
}

function renderHtmlEmail(request: UserRequest): string {
  const bookingLine = request.intent === "appointment"
    ? `${request.appointmentDate} at ${resolveAppointmentSlotLabel(request.appointmentSlot)}`
    : "Not requested";

  return `
    <h1>New contact form submission</h1>
    <p><strong>Submitted:</strong> ${escapeHtml(new Date().toISOString())}</p>
    <p><strong>Request Type:</strong> ${escapeHtml(request.intent === "appointment" ? "Appointment booking" : "General inquiry")}<br>
    <strong>Name:</strong> ${escapeHtml(request.name)}<br>
    <strong>Email:</strong> ${escapeHtml(request.email)}<br>
    <strong>Phone:</strong> ${escapeHtml(request.phone || "Not provided")}<br>
    <strong>Company:</strong> ${escapeHtml(request.company || "Not provided")}<br>
    <strong>Referral:</strong> ${escapeHtml(request.referral || "Not provided")}<br>
    <strong>Appointment:</strong> ${escapeHtml(bookingLine)}</p>
    <h2>Message</h2>
    <p>${escapeHtml(request.message).replaceAll("\n", "<br>")}</p>
  `;
}