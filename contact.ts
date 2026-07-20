import twilio from "twilio";

const CONTACT_INBOX = "office@gatewaycorporate.org";
const BLOCKED_EMAILS = new Set<string>(
  ([] as string[]).map((value) => value.trim().toLowerCase()),
);

interface UserRequest {
  name: string;
  email: string;
  referral: string;
  message: string;
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

export async function handleUserRequest(form: URLSearchParams): Promise<void> {
  const recaptchaToken = sanitizeText(form.get("g-recaptcha-response"), 4000);
  if (!recaptchaToken) {
    throw new Error("Please complete the reCAPTCHA check before submitting.");
  }

  await verifyRecaptcha(recaptchaToken);

  const userRequest = parseUserRequest(form);
  const provider = createMailProvider();

  await provider.sendContactEmail(userRequest);
  await sendTwilioNotification(userRequest);

  console.log("Contact request submitted", {
    email: userRequest.email,
    referral: userRequest.referral || "not provided",
  });
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
  const request: UserRequest = {
    name: sanitizeText(form.get("name"), 120),
    email: sanitizeText(form.get("email"), 160),
    referral: sanitizeText(form.get("referral"), 100),
    message: sanitizeText(form.get("message"), 2000),
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

  return request;
}

async function verifyRecaptcha(token: string): Promise<void> {
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
    return;
  }

  const twilioClient = twilio(accountSid, authToken);
  const referralLine = request.referral ? ` Referral: ${request.referral}` : "";

  await twilioClient.messages.create({
    body: `New request from ${request.name} (${request.email}): ${request.message}${referralLine}`,
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
  return [
    "New contact form submission",
    "",
    `Submitted: ${new Date().toISOString()}`,
    `Name: ${request.name}`,
    `Email: ${request.email}`,
    `Referral: ${request.referral || "Not provided"}`,
    "",
    "Message:",
    request.message,
  ].join("\n");
}

function renderHtmlEmail(request: UserRequest): string {
  return `
    <h1>New contact form submission</h1>
    <p><strong>Submitted:</strong> ${escapeHtml(new Date().toISOString())}</p>
    <p><strong>Name:</strong> ${escapeHtml(request.name)}<br>
    <strong>Email:</strong> ${escapeHtml(request.email)}<br>
    <strong>Referral:</strong> ${escapeHtml(request.referral || "Not provided")}</p>
    <h2>Message</h2>
    <p>${escapeHtml(request.message).replaceAll("\n", "<br>")}</p>
  `;
}